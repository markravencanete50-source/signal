import "server-only";

import { getAdapter } from "@/adapters/registry";
import { detectAnomalies, type BrandReachSeries } from "@/services/anomaly";
import {
  averageRates,
  computeIntentScore,
  ratesFromMetrics,
  type PostRates,
} from "@/services/intent";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  PLATFORM_LABEL,
  VARIANT_KEY,
  type Connection,
  type Platform,
  type Post,
  type VariantKey,
} from "@/types";
import type { PostMetrics } from "@/types/metrics";

import { classifySentiments } from "./ai/sentiment";
import { recordAnomaly } from "./db/anomalies";
import { getBrand } from "./db/brands";
import {
  getDecryptedToken,
  listActiveConnections,
  markConnectionError,
  touchLastSync,
} from "./db/connections";
import { upsertInboxItem } from "./db/inbox";
import { getAsset } from "./db/media";
import { listDaily, listRecentPostMetrics, upsertDaily, upsertPostMetrics } from "./db/metrics";
import { notifyWorkspaceAdmins } from "./db/notifications";
import { listRecentlyPublished } from "./db/posts";
import { getWorkspace } from "./db/workspaces";

/**
 * The sync engine. Runs hourly via `/api/cron/sync`.
 *
 * Per active connection: pull account insights → metricsDaily; re-fetch metrics
 * for posts <14 days old, compute intent scores → postMetrics; pull new comments
 * → inboxItems (sentiment via Claude). Then, per workspace, run cross-brand
 * anomaly detection and notify.
 *
 * Everything is idempotent — deterministic doc ids mean a re-run overwrites
 * rather than duplicates, so the hourly cadence is safe.
 */

const FOURTEEN_DAYS_MS = 14 * 86_400_000;
const NINETY_DAYS_MS = 90 * 86_400_000;

export async function runSync(): Promise<{ connections: number; anomalies: number }> {
  const connections = await listActiveConnections();

  // Group by workspace so anomaly detection can compare a workspace's brands.
  const byWorkspace = new Map<string, Connection[]>();
  for (const c of connections) {
    const list = byWorkspace.get(c.workspaceId) ?? [];
    list.push(c);
    byWorkspace.set(c.workspaceId, list);
  }

  let anomalyCount = 0;

  for (const [workspaceId, conns] of byWorkspace) {
    for (const conn of conns) {
      try {
        await syncConnection(conn);
        await touchLastSync(conn.id);
      } catch (err) {
        // One bad connection must not abort the whole workspace's sync. Still
        // log every failure — silently swallowing a non-auth error left this
        // undiagnosable in production; only auth errors used to leave a trace.
        const message = err instanceof Error ? err.message : "Sync failed";
        console.error(`[sync] connection ${conn.id} (${conn.platform}) failed: ${message}`);
        if (isAuthError(message)) await markConnectionError(conn.id, message).catch(() => {});
      }
    }

    anomalyCount += await detectWorkspaceAnomalies(workspaceId, conns);
  }

  return { connections: connections.length, anomalies: anomalyCount };
}

/**
 * Sync one connection: account daily, post metrics + intent, comments.
 *
 * Each stage is isolated. The three data pulls fail for *independent* reasons —
 * a deprecated Page metric rejects the whole account-insights call (Meta has
 * done this repeatedly; see the metric-migration commits), post insights need a
 * live post, and comment reads sit behind a stricter Advanced-Access gate on
 * pages_read_engagement. Coupling them meant a single deprecated page metric
 * wiped out post-level capture *and* skipped touchLastSync, so nothing landed
 * from an account that was otherwise perfectly readable. Now one stage failing
 * degrades only its own data; the rest still writes.
 *
 * A dead token is the exception — it fails every stage — so an auth error is
 * remembered and rethrown, letting the caller flag the connection for reconnect.
 */
async function syncConnection(conn: Connection): Promise<void> {
  const token = await getDecryptedToken(conn);
  const adapter = getAdapter(conn.platform);
  const now = Date.now();
  const since = new Date(now - FOURTEEN_DAYS_MS);

  let authError: Error | null = null;
  const runStage = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : `${label} failed`;
      console.error(
        `[sync] ${label} for connection ${conn.id} (${conn.platform}) failed: ${message}`,
      );
      // A dead/expired token fails every stage with an auth error — capture the
      // first so it can be rethrown to mark the connection, but let the other
      // stages still try (they simply no-op).
      if (!authError && err instanceof Error && isAuthError(message)) authError = err;
    }
  };

  // 1. Account insights → metricsDaily (last 14 days).
  await runStage("account insights", async () => {
    const daily = await adapter.fetchAccountInsights(conn, token, {
      from: since,
      to: new Date(now),
    });
    await Promise.all(
      daily.map((d) =>
        upsertDaily({
          brandId: conn.brandId,
          workspaceId: conn.workspaceId,
          platform: conn.platform,
          date: d.date,
          followers: d.followers,
          reach: d.reach,
          impressions: d.impressions,
          engagement: d.engagement,
          profileViews: d.profileViews,
        }),
      ),
    );
  });

  // 2. Post metrics + intent for posts <14 days old.
  await runStage("post metrics", () => syncPostMetrics(conn, token, adapter, since.toISOString()));

  // 3. New comments → inbox with sentiment.
  await runStage("comments", () => syncComments(conn, token, adapter, since));

  // Surface a dead token so runSync marks the connection + skips touchLastSync.
  if (authError) throw authError;
}

async function syncPostMetrics(
  conn: Connection,
  token: string,
  adapter: ReturnType<typeof getAdapter>,
  sinceIso: string,
): Promise<void> {
  const posts = await listRecentlyPublished(conn.brandId, sinceIso);
  const key = VARIANT_KEY[conn.platform];

  // Baseline: the brand's trailing-90-day rate averages, from stored postMetrics.
  const ninetyAgo = new Date(Date.now() - NINETY_DAYS_MS).toISOString();
  const priorMetrics = await listRecentPostMetrics(conn.brandId, ninetyAgo);
  const baseline = averageRates(
    priorMetrics.filter((m) => m.platform === conn.platform).map(toRates),
  );
  const weights =
    (await getWorkspace(conn.workspaceId))?.settings.intentWeights ??
    DEFAULT_WORKSPACE_SETTINGS.intentWeights;

  for (const post of posts) {
    const result = post.results?.[key];
    if (!result?.externalId) continue;

    try {
      const raw = await adapter.fetchPostInsights(conn, token, result.externalId);
      const rates = ratesFromMetrics(raw);
      const intentScore = computeIntentScore(rates, baseline, weights);

      await upsertPostMetrics({
        postId: post.id,
        brandId: conn.brandId,
        workspaceId: conn.workspaceId,
        platform: conn.platform,
        syncedAt: new Date().toISOString(),
        externalId: result.externalId,
        title: summarise(post, key),
        format: await inferFormat(post, key),
        publishedAt: post.publishedAt ?? new Date().toISOString(),
        likes: raw.likes,
        comments: raw.comments,
        saves: raw.saves,
        shares: raw.shares,
        reach: raw.reach,
        reachNonFollowers: raw.reachNonFollowers,
        watchTimeAvg: raw.watchTimeAvg,
        completionRate: raw.completionRate,
        profileClicks: raw.profileClicks,
        intentScore,
      });
    } catch {
      // Skip a single unfetchable post; the rest of the sync continues.
    }
  }
}

async function syncComments(
  conn: Connection,
  token: string,
  adapter: ReturnType<typeof getAdapter>,
  since: Date,
): Promise<void> {
  const raw = await adapter.fetchComments(conn, token, since);
  if (raw.length === 0) return;

  // Classify the whole batch in one Claude call.
  const sentiments = await classifySentiments(raw.map((c) => c.text));

  await Promise.all(
    raw.map((c, i) =>
      upsertInboxItem({
        brandId: conn.brandId,
        workspaceId: conn.workspaceId,
        platform: conn.platform,
        type: c.type,
        externalId: c.externalId,
        postId: c.externalPostId,
        authorName: c.authorName,
        authorAvatar: c.authorAvatar,
        text: c.text,
        sentiment: sentiments[i] ?? "neutral",
        receivedAt: c.receivedAt.toISOString(),
      }).catch(() => false),
    ),
  );
}

/**
 * Run anomaly detection across a workspace's brands and record + notify.
 *
 * Builds a reach series per connected brand+platform from metricsDaily, hands it
 * to the pure detector, then writes each anomaly with a reasoning string and
 * notifies workspace admins. Returns the number of anomalies recorded.
 *
 * Exported so the integration test can drive it on seeded metricsDaily directly
 * — the account-insight fetch in a full sync overwrites daily data, so testing
 * the verdict end-to-end means invoking this stage against known reach series.
 */
export async function detectWorkspaceAnomalies(
  workspaceId: string,
  conns: Connection[],
): Promise<number> {
  const seriesList: BrandReachSeries[] = [];

  const to = new Date();
  const from = new Date(to.getTime() - FOURTEEN_DAYS_MS);
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);

  for (const conn of conns) {
    const daily = await listDaily(conn.brandId, conn.platform, fromDate, toDate);
    if (daily.length >= 14) {
      seriesList.push({
        brandId: conn.brandId,
        platform: conn.platform,
        dailyReach: daily.map((d) => d.reach),
      });
    }
  }

  const anomalies = detectAnomalies(seriesList);
  if (anomalies.length === 0) return 0;

  const nowIso = new Date().toISOString();

  for (const a of anomalies) {
    const brand = await getBrand(a.brandId);
    const reasoning = buildReasoning(a.verdict, a.dropPct, a.platform);

    await recordAnomaly({
      workspaceId,
      brandId: a.brandId,
      platform: a.platform,
      detectedAt: nowIso,
      dropPct: a.dropPct,
      verdict: a.verdict,
      reasoning,
    });

    await notifyWorkspaceAdmins(workspaceId, {
      title:
        a.verdict === "platform_side"
          ? `${PLATFORM_LABEL[a.platform]} reach dropped account-wide`
          : `${brand?.name ?? "A brand"}'s reach dropped`,
      body: reasoning,
      href: "/pulse",
    }).catch(() => {});
  }

  return anomalies.length;
}

function buildReasoning(
  verdict: "platform_side" | "content_side",
  dropPct: number,
  platform: Platform,
): string {
  const p = PLATFORM_LABEL[platform];
  if (verdict === "platform_side") {
    return `${p} reach fell ${dropPct}% across multiple brands at the same time, with no change in content mix. This pattern points to a platform-side shift, not a content problem — hold strategy and re-check in 7 days.`;
  }
  return `${p} reach fell ${dropPct}% for this brand while others held steady. That points to a content-side cause — review recent posts for off-niche drift.`;
}

function toRates(m: PostMetrics): PostRates {
  return ratesFromMetrics(m);
}

function summarise(post: Post, key: VariantKey): string {
  const caption = post.variants[key]?.caption ?? "Post";
  return (caption.split("\n")[0] ?? "Post").slice(0, 60);
}

/**
 * Format drives the analytics "intent by format" bars, so it must distinguish
 * video (Reels) from stills. Multiple assets → carousel; otherwise read the
 * single asset's type.
 */
async function inferFormat(post: Post, key: VariantKey): Promise<"image" | "video" | "carousel"> {
  const ids = post.variants[key]?.mediaAssetIds ?? [];
  if (ids.length > 1) return "carousel";
  if (ids.length === 1) {
    const asset = await getAsset(ids[0]!);
    if (asset?.type === "video") return "video";
  }
  return "image";
}

function isAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("token") || m.includes("expired") || m.includes("reconnect") || m.includes("oauth")
  );
}
