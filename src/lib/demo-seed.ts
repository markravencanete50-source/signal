import "server-only";

import { generatePublicToken } from "./crypto";
import { getBrand } from "./db/brands";
import { listConnectionsForBrand, upsertConnection } from "./db/connections";
import { recordAnomaly } from "./db/anomalies";
import { recordAudit } from "./db/audit";
import { upsertInboxItem } from "./db/inbox";
import { createNotification, notifyWorkspaceAdmins } from "./db/notifications";
import { getOrCreateSmartLink } from "./db/smartlinks";
import { adminDb } from "./firebase-admin";
import { isMockMode } from "./env";
import { buildSnapshot, resolvePeriod } from "./reports/snapshot";
import { syncBrandNow, type ManualSyncResult } from "./sync-engine";
import type { TokenSet } from "@/adapters/types";
import type {
  Autolist,
  Brand,
  Competitor,
  CompetitorSnapshot,
  Platform,
  Post,
  PostStatus,
  PostVariant,
  ReportBrandSnapshot,
  ReportNarrative,
  SmartLinkItem,
  VariantKey,
} from "@/types";
import type { MediaAsset } from "@/types/media";

/**
 * Demo-data seeder — the "Load demo data" button in Settings → Connections.
 *
 * The mock adapter already lets every engine run without Meta, but it only
 * produces data once there are *connections and published posts* to run against.
 * This closes that gap: it stands up a coherent, end-to-end demo tenant — mock
 * connections, a fortnight of published/scheduled/draft posts, a media library,
 * an inbox, competitors, autolists, a SmartLink, an anomaly and a report — so
 * every screen in the app has something real-shaped to show.
 *
 * Two rules keep it safe:
 *
 * 1. **Mock mode only.** Refuses to run unless `USE_MOCK_ADAPTERS` is on, so it
 *    can never write fabricated metrics into a tenant backed by the live Graph
 *    API. Fake numbers in a real customer's Analytics would be worse than an
 *    empty state.
 * 2. **Idempotent.** Every seeded document has a deterministic id derived from
 *    the brand, so pressing the button twice overwrites in place rather than
 *    piling up duplicates — the same discipline the sync and publish engines use.
 *
 * The metrics themselves are produced by running the real `syncBrandNow` against
 * the mock adapter, not hand-written here: the demo therefore exercises the
 * actual capture path (account insights → metricsDaily, post insights + intent
 * → postMetrics, comments → inbox) rather than a parallel fixture that could
 * drift from it.
 */

// ---------------------------------------------------------------------------
// result
// ---------------------------------------------------------------------------

export interface DemoSeedResult {
  ok: boolean;
  at: string;
  error?: string;
  /** Per-connection sync summary, mirroring the "Run sync now" output. */
  sync: ManualSyncResult[];
  counts: {
    connections: number;
    media: number;
    posts: number;
    inbox: number;
    metricsDaily: number;
    postMetrics: number;
    competitors: number;
    autolists: number;
    smartlinkLinks: number;
    anomalies: number;
    reports: number;
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Deterministic doc id for a seeded document, so re-runs overwrite in place. */
function demoId(brandId: string, ...parts: (string | number)[]): string {
  return `demo_${brandId}_${parts.join("_")}`;
}

/** ISO for `n` days before `now` (may be fractional). */
function daysAgo(now: number, n: number): string {
  return new Date(now - n * 86_400_000).toISOString();
}

/** YYYY-MM-DD for `n` days before `now`. */
function dateDaysAgo(now: number, n: number): string {
  return new Date(now - n * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export async function seedDemoData(params: {
  brandId: string;
  userId: string;
  userName: string;
}): Promise<DemoSeedResult> {
  const at = new Date().toISOString();
  const empty: DemoSeedResult["counts"] = {
    connections: 0,
    media: 0,
    posts: 0,
    inbox: 0,
    metricsDaily: 0,
    postMetrics: 0,
    competitors: 0,
    autolists: 0,
    smartlinkLinks: 0,
    anomalies: 0,
    reports: 0,
  };

  // Guard: never fabricate data into a live-Graph tenant.
  if (!isMockMode()) {
    return {
      ok: false,
      at,
      error:
        "Demo data can only be loaded in mock mode (USE_MOCK_ADAPTERS=true). Turn it off to protect real Analytics.",
      sync: [],
      counts: empty,
    };
  }

  const brand = await getBrand(params.brandId);
  if (!brand) {
    return { ok: false, at, error: "Brand not found.", sync: [], counts: empty };
  }

  try {
    const { userId, userName } = params;

    // 1. Connections — mock FB + IG, so every capture path has something to run.
    const connections = await seedConnections(brand, userName);

    // 2. Media library — referenced by the posts below.
    const media = await seedMedia(brand, userId);

    // 3. Posts — published (for metrics), scheduled (planner), draft, and
    //    pending-approval (approvals). Must exist before the sync so post
    //    insights have live posts to attach to.
    const posts = await seedPosts(brand, userId, media);

    // 4. Run the REAL capture against the mock adapter: metricsDaily, postMetrics
    //    (+ intent), and inbox comments. This is the "Run sync" the demo wraps.
    const sync = await syncBrandNow(brand.id);
    const metricsDaily = sync.reduce((s, c) => s + (c.daily ?? 0), 0);
    const postMetrics = sync.reduce((s, c) => s + (c.posts ?? 0), 0);

    // 5. Seed an inbox with varied sentiments directly, so the Inbox filters
    //    (esp. Leads) are demonstrable even when AI classification is unconfigured
    //    and the synced comments all fall back to neutral.
    const inbox = await seedInbox(brand);

    // 6. Feature data the sync engine doesn't touch.
    const competitors = await seedCompetitors(brand, userId);
    const autolists = await seedAutolists(brand, userId, media);
    const smartlinkLinks = await seedSmartLink(brand);
    const anomalies = await seedAnomaly(brand);
    const reports = await seedReport(brand, userId);

    // 7. A welcome notification + an audit trail for the seed itself.
    await createNotification({
      userId,
      workspaceId: brand.workspaceId,
      title: "Demo data loaded",
      body: `Sample analytics, posts, inbox and competitors are ready for ${brand.name}. Explore any screen — it's all mock data.`,
      href: "/dashboard",
    }).catch(() => {});
    await recordAudit({
      workspaceId: brand.workspaceId,
      actorId: userId,
      actorName: userName,
      action: "demo.seeded",
      target: brand.name,
    }).catch(() => {});

    return {
      ok: true,
      at,
      sync,
      counts: {
        connections,
        media: media.length,
        posts,
        inbox,
        metricsDaily,
        postMetrics,
        competitors,
        autolists,
        smartlinkLinks,
        anomalies,
        reports,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Seeding failed.";
    return { ok: false, at, error, sync: [], counts: empty };
  }
}

// ---------------------------------------------------------------------------
// connections
// ---------------------------------------------------------------------------

async function seedConnections(brand: Brand, connectedByName: string): Promise<number> {
  const existing = await listConnectionsForBrand(brand.id);
  const have = new Set(existing.map((c) => c.platform));
  const handle = `@${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`.slice(0, 30);

  let created = 0;
  for (const platform of ["fb", "ig"] as Platform[]) {
    if (have.has(platform)) continue;

    const expiresAt = new Date();
    // FB healthy; IG deliberately near expiry so the amber "expires in N days"
    // health band and the token-health monitor are visible in the demo.
    expiresAt.setDate(expiresAt.getDate() + (platform === "ig" ? 8 : 55));

    const tokens: TokenSet = {
      accessToken: `mock_demo_token_${platform}_${brand.id}`,
      expiresAt,
      scopes:
        platform === "ig"
          ? [
              "instagram_basic",
              "instagram_content_publish",
              "instagram_manage_insights",
              "instagram_manage_comments",
            ]
          : ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
      pageId: `mock_page_${brand.id}`,
      igUserId: platform === "ig" ? `mock_ig_${brand.id}` : undefined,
      accountName: platform === "ig" ? handle : brand.name,
      authorizingUserId: `mock_user_${brand.id}`,
    };

    await upsertConnection({
      brandId: brand.id,
      workspaceId: brand.workspaceId,
      platform,
      tokens,
      connectedByName,
    });
    created++;
  }
  return created;
}

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------

/**
 * A small, stable media library. Images use picsum (seeded → deterministic);
 * videos use Cloudinary's public demo cloud so the poster transform (.mp4 → .jpg)
 * resolves. Plain <img> tags render these, so no host allowlist is involved.
 */
async function seedMedia(brand: Brand, uploadedBy: string): Promise<string[]> {
  const specs: Array<{ slug: string; type: MediaAsset["type"]; url: string; tags: string[] }> = [
    { slug: "listing-1", type: "image", url: "https://picsum.photos/seed/signal-list-1/1080/1080", tags: ["listing", "exterior"] }, // prettier-ignore
    { slug: "listing-2", type: "image", url: "https://picsum.photos/seed/signal-list-2/1080/1080", tags: ["listing", "kitchen"] }, // prettier-ignore
    { slug: "listing-3", type: "image", url: "https://picsum.photos/seed/signal-list-3/1080/1080", tags: ["listing", "interior"] }, // prettier-ignore
    { slug: "team", type: "image", url: "https://picsum.photos/seed/signal-team/1080/1080", tags: ["team", "culture"] }, // prettier-ignore
    { slug: "market", type: "image", url: "https://picsum.photos/seed/signal-market/1080/1080", tags: ["market-data"] }, // prettier-ignore
    { slug: "reel", type: "video", url: "https://res.cloudinary.com/demo/video/upload/dog.mp4", tags: ["reel", "walkthrough"] }, // prettier-ignore
  ];

  const ids: string[] = [];
  await Promise.all(
    specs.map(async (s, i) => {
      const id = demoId(brand.id, "media", s.slug);
      const asset: Omit<MediaAsset, "id"> = {
        workspaceId: brand.workspaceId,
        cloudinaryPublicId: `demo/${brand.id}/${s.slug}`,
        type: s.type,
        format: s.type === "video" ? "mp4" : "jpg",
        width: 1080,
        height: 1080,
        bytes: s.type === "video" ? 4_800_000 : 320_000,
        ...(s.type === "video" ? { durationSec: 18 } : {}),
        tags: s.tags,
        folder: "demo",
        uploadedBy,
        createdAt: daysAgo(Date.now(), 20 - i),
        usage: [],
        secureUrl: s.url,
      };
      const clean = Object.fromEntries(Object.entries(asset).filter(([, v]) => v !== undefined));
      await adminDb().doc(`mediaAssets/${id}`).set(clean);
      ids.push(id);
    }),
  );
  return ids;
}

// ---------------------------------------------------------------------------
// posts
// ---------------------------------------------------------------------------

interface PostSpec {
  slug: string;
  status: PostStatus;
  /** Days from now: negative = published in the past, positive = scheduled ahead. */
  offsetDays: number;
  pillar: string;
  caption: string;
  /** Indices into the seeded media list. >1 → carousel, single video → Reel. */
  media: number[];
  platforms: VariantKey[];
  ai?: { predictedScore: number; reasoning: string };
  needsApproval?: boolean;
}

async function seedPosts(brand: Brand, createdBy: string, mediaIds: string[]): Promise<number> {
  const pillars = brand.pillars.length
    ? brand.pillars.map((p) => p.name)
    : ["Listings", "Education", "Market data", "Team & culture"];
  const p = (i: number) => pillars[i % pillars.length]!;

  const specs: PostSpec[] = [
    // --- Published in the last fortnight → drive Analytics / Dashboard / Reports.
    { slug: "pub-1", status: "published", offsetDays: -1, pillar: p(0), caption: "Just listed: a bright 2-bed in Headingley with a south-facing garden. Book a viewing this weekend before it's gone. 🏡", media: [0], platforms: ["facebook", "instagram"], ai: { predictedScore: 78, reasoning: "Listings with a clear CTA and a viewing window out-save the account average by ~30%." } }, // prettier-ignore
    { slug: "pub-2", status: "published", offsetDays: -2, pillar: p(2), caption: "Leeds rents rose 4.1% year-on-year. Here's what that means if your tenancy renews this quarter. 📈", media: [4], platforms: ["facebook", "instagram"] }, // prettier-ignore
    { slug: "pub-3", status: "published", offsetDays: -4, pillar: p(1), caption: "Renting 101: what a fair deposit deduction actually looks like, and what it doesn't. Save this for renewal season.", media: [2], platforms: ["instagram"] }, // prettier-ignore
    { slug: "pub-4", status: "published", offsetDays: -5, pillar: p(0), caption: "Walkthrough Reel: inside the refurbished Chapel Allerton 3-bed. Swipe up to register interest. 🎥", media: [5], platforms: ["instagram"] }, // prettier-ignore
    { slug: "pub-5", status: "published", offsetDays: -7, pillar: p(3), caption: "Meet the team keeping your tenancy running — a morning with our lettings coordinators. 👋", media: [3], platforms: ["facebook", "instagram"] }, // prettier-ignore
    { slug: "pub-6", status: "published", offsetDays: -9, pillar: p(0), caption: "Three new instructions this week across LS6 and LS7. Carousel: take a look. 🏘️", media: [0, 1, 2], platforms: ["instagram"] }, // prettier-ignore
    { slug: "pub-7", status: "published", offsetDays: -11, pillar: p(1), caption: "Landlord tip: a quick mid-tenancy check-in prevents most end-of-tenancy disputes. Here's our checklist.", media: [1], platforms: ["facebook"] }, // prettier-ignore
    { slug: "pub-8", status: "published", offsetDays: -13, pillar: p(2), caption: "Average time-to-let in Leeds is now 11 days. Priced right, quality homes move fast.", media: [4], platforms: ["facebook", "instagram"] }, // prettier-ignore

    // --- Scheduled ahead → populate the Planner calendar.
    { slug: "sch-1", status: "scheduled", offsetDays: 1, pillar: p(0), caption: "Coming to market Monday: a canal-side 1-bed with parking. Set a reminder to be first in. ⏰", media: [0], platforms: ["facebook", "instagram"] }, // prettier-ignore
    { slug: "sch-2", status: "scheduled", offsetDays: 3, pillar: p(1), caption: "Moving with pets? Here's how to present a strong application and reassure landlords. 🐾", media: [2], platforms: ["instagram"] }, // prettier-ignore
    { slug: "sch-3", status: "scheduled", offsetDays: 6, pillar: p(2), caption: "Monthly market snapshot: supply, demand and where rents are heading. Full breakdown Friday.", media: [4], platforms: ["facebook", "instagram"] }, // prettier-ignore

    // --- Draft → the Studio / Composer working set.
    { slug: "draft-1", status: "draft", offsetDays: 0, pillar: p(3), caption: "Behind the scenes: how we vet a new landlord before taking an instruction. (draft — needs a cover image)", media: [], platforms: ["instagram"] }, // prettier-ignore

    // --- Pending approval → the Approvals queue.
    { slug: "appr-1", status: "pending_approval", offsetDays: 2, pillar: p(0), caption: "Price drop on the Kirkstall 2-bed — now offered furnished. Enquire today. 💷", media: [1], platforms: ["facebook", "instagram"], needsApproval: true }, // prettier-ignore
    { slug: "appr-2", status: "pending_approval", offsetDays: 4, pillar: p(1), caption: "Right-to-rent checks explained in 60 seconds — what every new tenant needs ready.", media: [3], platforms: ["instagram"], needsApproval: true }, // prettier-ignore
  ];

  const now = Date.now();
  await Promise.all(
    specs.map((s) => writePost(brand, createdBy, mediaIds, s, now).catch(() => {})),
  );
  return specs.length;
}

async function writePost(
  brand: Brand,
  createdBy: string,
  mediaIds: string[],
  s: PostSpec,
  now: number,
): Promise<void> {
  const id = demoId(brand.id, "post", s.slug);
  const assetIds = s.media.map((i) => mediaIds[i]).filter((v): v is string => Boolean(v));

  const variants: Post["variants"] = {};
  const results: Post["results"] = {};
  for (const key of s.platforms) {
    const variant: PostVariant = { caption: s.caption, mediaAssetIds: assetIds };
    variants[key] = variant;
    if (s.status === "published") {
      const platform: Platform = key === "instagram" ? "ig" : "fb";
      const externalId = `${platform}_${s.slug}_${brand.id}`.replace(/[^a-zA-Z0-9_]/g, "");
      results[key] = {
        externalId,
        permalink:
          platform === "ig"
            ? `https://instagram.com/p/${externalId}`
            : `https://facebook.com/${brand.id}/posts/${externalId}`,
      };
    }
  }

  const doc: Omit<Post, "id"> = {
    brandId: brand.id,
    workspaceId: brand.workspaceId,
    createdBy,
    status: s.status,
    attempts: s.status === "published" ? 1 : 0,
    pillar: s.pillar,
    variants,
    ...(s.offsetDays !== 0 || s.status === "scheduled" || s.status === "pending_approval"
      ? { scheduledAt: daysAgo(now, -s.offsetDays) }
      : {}),
    ...(s.status === "published"
      ? {
          publishedAt: daysAgo(now, -s.offsetDays),
          results,
          verification: {
            state: "confirmed",
            dueAt: daysAgo(now, -s.offsetDays),
            checkedAt: daysAgo(now, -s.offsetDays + 0.01),
            attempts: 0,
          },
        }
      : {}),
    ...(s.needsApproval
      ? {
          approval: {
            required: true,
            requestedFrom: "client@example.com",
            approvalToken: generatePublicToken(),
          },
        }
      : {}),
    ...(s.ai ? { aiMeta: { suggested: true, ...s.ai } } : {}),
  };

  const clean = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
  await adminDb().doc(`posts/${id}`).set(clean);
}

// ---------------------------------------------------------------------------
// inbox
// ---------------------------------------------------------------------------

async function seedInbox(brand: Brand): Promise<number> {
  const now = Date.now();
  const items: Array<{
    slug: string;
    platform: Platform;
    author: string;
    text: string;
    sentiment: "positive" | "neutral" | "negative" | "lead";
    hoursAgo: number;
  }> = [
    { slug: "lead-1", platform: "ig", author: "Sarah K.", text: "Is the Headingley 2-bed still available? Would love a viewing this weekend if so 🙏", sentiment: "lead", hoursAgo: 3 }, // prettier-ignore
    { slug: "lead-2", platform: "fb", author: "Priya N.", text: "What's the going rate for a 3-bed in Chapel Allerton these days? Looking to move in September.", sentiment: "lead", hoursAgo: 9 }, // prettier-ignore
    { slug: "neg-1", platform: "fb", author: "Tom B.", text: "Still waiting on my deposit return from March. Third time asking here — can someone actually respond?", sentiment: "negative", hoursAgo: 20 }, // prettier-ignore
    { slug: "pos-1", platform: "ig", author: "Dan R.", text: "Mentioned you in a landlords group — your fee breakdown post was the clearest I've seen. 👏", sentiment: "positive", hoursAgo: 28 }, // prettier-ignore
    { slug: "neu-1", platform: "ig", author: "James M.", text: "Great refurb video — which contractor did you use for the kitchen?", sentiment: "neutral", hoursAgo: 40 }, // prettier-ignore
  ];

  let count = 0;
  for (const it of items) {
    const created = await upsertInboxItem({
      brandId: brand.id,
      workspaceId: brand.workspaceId,
      platform: it.platform,
      type: "comment",
      externalId: `demo_${brand.id}_${it.slug}`,
      authorName: it.author,
      text: it.text,
      sentiment: it.sentiment,
      receivedAt: new Date(now - it.hoursAgo * 3_600_000).toISOString(),
    }).catch(() => false);
    if (created) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// competitors
// ---------------------------------------------------------------------------

async function seedCompetitors(brand: Brand, addedBy: string): Promise<number> {
  const specs: Array<{
    slug: string;
    platform: Platform;
    handle: string;
    name: string;
    followers: number;
    growth: number;
  }> = [
    { slug: "comp-1", platform: "ig", handle: "@leedslivinglets", name: "Leeds Living Lets", followers: 18400, growth: 6.2 }, // prettier-ignore
    { slug: "comp-2", platform: "ig", handle: "@northernnest", name: "Northern Nest Property", followers: 12750, growth: -1.8 }, // prettier-ignore
    { slug: "comp-3", platform: "fb", handle: "@citygaterentals", name: "Citygate Rentals", followers: 9300, growth: 2.4 }, // prettier-ignore
  ];

  const now = Date.now();
  const today = dateDaysAgo(now, 0);
  const monthAgo = dateDaysAgo(now, 30);

  await Promise.all(
    specs.map(async (c) => {
      const id = demoId(brand.id, c.slug);
      const latest: CompetitorSnapshot = {
        date: today,
        followers: c.followers,
        postsLast30d: 14 + (c.followers % 12),
        avgEngagementRate: 0.02 + (c.followers % 40) / 1000,
      };
      const baselineFollowers = Math.round(c.followers / (1 + c.growth / 100));
      const baseline: CompetitorSnapshot = {
        date: monthAgo,
        followers: baselineFollowers,
        postsLast30d: latest.postsLast30d - 2,
        avgEngagementRate: latest.avgEngagementRate - 0.003,
      };

      const competitor: Omit<Competitor, "id"> = {
        workspaceId: brand.workspaceId,
        brandId: brand.id,
        platform: c.platform,
        handle: c.handle,
        displayName: c.name,
        addedBy,
        createdAt: daysAgo(now, 31),
        latest,
        growth30dPct: c.growth,
      };
      const ref = adminDb().doc(`competitors/${id}`);
      await ref.set(competitor);
      await ref.collection("snapshots").doc(baseline.date).set(baseline);
      await ref.collection("snapshots").doc(latest.date).set(latest);
    }),
  );
  return specs.length;
}

// ---------------------------------------------------------------------------
// autolists
// ---------------------------------------------------------------------------

async function seedAutolists(brand: Brand, createdBy: string, mediaIds: string[]): Promise<number> {
  const now = Date.now();
  const id = demoId(brand.id, "autolist", "evergreen");

  const autolist: Omit<Autolist, "id"> = {
    workspaceId: brand.workspaceId,
    brandId: brand.id,
    name: "Evergreen tips",
    type: "evergreen",
    enabled: true,
    platforms: ["fb", "ig"],
    cadenceDays: 3,
    nextRunAt: daysAgo(now, -2),
    lastRunAt: daysAgo(now, 1),
    items: [
      { id: "e1", caption: "Reminder: register for viewing alerts so you hear about new lettings first. 🔔", mediaAssetIds: mediaIds[2] ? [mediaIds[2]] : [], lastIntentScore: 64 }, // prettier-ignore
      { id: "e2", caption: "Moving checklist: 5 things to sort in the week before you collect your keys. 🔑", mediaAssetIds: mediaIds[3] ? [mediaIds[3]] : [], lastIntentScore: 58 }, // prettier-ignore
      { id: "e3", caption: "Why we reference every applicant — protecting tenants and landlords alike.", mediaAssetIds: mediaIds[1] ? [mediaIds[1]] : [], retired: true, retiredReason: "Scored below the intent threshold last cycle — rework in Studio." }, // prettier-ignore
    ],
    cursor: 1,
    retireBelowIntent: 40,
    seenLinks: [],
    createdBy,
    createdAt: daysAgo(now, 25),
    updatedAt: daysAgo(now, 1),
  };

  await adminDb().doc(`autolists/${id}`).set(autolist);
  return 1;
}

// ---------------------------------------------------------------------------
// smartlink
// ---------------------------------------------------------------------------

async function seedSmartLink(brand: Brand): Promise<number> {
  const smartlink = await getOrCreateSmartLink(brand);

  const links: SmartLinkItem[] = [
    { id: "sl1", label: "Browse available lettings", url: "https://example.com/lettings", hot: true, clicks: 214 }, // prettier-ignore
    { id: "sl2", label: "Book a viewing", url: "https://example.com/viewings", hot: false, clicks: 132 }, // prettier-ignore
    { id: "sl3", label: "Landlord valuation", url: "https://example.com/valuation", hot: false, clicks: 47 }, // prettier-ignore
    { id: "sl4", label: "Tenant guides", url: "https://example.com/guides", hot: false, clicks: 61 }, // prettier-ignore
  ];
  const totalClicks = links.reduce((s, l) => s + l.clicks, 0);

  // Write links (with their accumulated clicks) and the total directly — the
  // editor's updateSmartLink deliberately resets new links to zero, which would
  // undo the demo counts.
  await adminDb()
    .doc(`smartlinks/${smartlink.id}`)
    .update({
      subtitle: `Lettings & property management — ${brand.name}`,
      links,
      totalClicks,
      updatedAt: new Date().toISOString(),
    });

  // Per-post attribution the Reports view reads back (aggregate, keyed by post).
  const attributions = [
    { post: "pub-1", title: "Just listed: bright 2-bed in Headingley", clicks: 96 },
    { post: "pub-4", title: "Walkthrough Reel: Chapel Allerton 3-bed", clicks: 71 },
    { post: "pub-2", title: "Leeds rents rose 4.1% year-on-year", clicks: 38 },
  ];
  await Promise.all(
    attributions.map((a) =>
      adminDb()
        .doc(`smartlinkClicks/${demoId(brand.id, "post", a.post)}`)
        .set({
          postId: demoId(brand.id, "post", a.post),
          brandId: brand.id,
          workspaceId: brand.workspaceId,
          postTitle: a.title,
          clicks: a.clicks,
          lastClickAt: new Date().toISOString(),
        }),
    ),
  );

  return links.length;
}

// ---------------------------------------------------------------------------
// anomaly
// ---------------------------------------------------------------------------

async function seedAnomaly(brand: Brand): Promise<number> {
  const reasoning =
    "Instagram reach fell 46% for this brand over the last 7 days while your other tracked accounts held steady. That points to a content-side cause rather than a platform change — review recent posts for off-niche drift and re-check in 7 days.";

  await recordAnomaly({
    workspaceId: brand.workspaceId,
    brandId: brand.id,
    platform: "ig",
    detectedAt: new Date().toISOString(),
    dropPct: 46,
    verdict: "content_side",
    reasoning,
  });

  await notifyWorkspaceAdmins(brand.workspaceId, {
    title: `${brand.name}'s reach dropped`,
    body: reasoning,
    href: "/pulse",
  }).catch(() => {});

  return 1;
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

async function seedReport(brand: Brand, createdBy: string): Promise<number> {
  const now = new Date();
  const period = "last-30-days" as const;
  const window = resolvePeriod(period, now);
  // Build the snapshot from the metrics the sync just wrote — a real aggregate,
  // not a hand-authored one, so the report matches Analytics.
  const snapshot: ReportBrandSnapshot[] = await buildSnapshot([brand.id], window);

  const narrative: ReportNarrative = {
    summary: `Over the last 30 days ${brand.name} kept a steady posting rhythm across Facebook and Instagram, led by listings and market-data content. Reach followed the usual weekly pattern with a mid-period dip worth watching, while intent held up on listing posts that paired a clear CTA with a viewing window.`,
    recommendations: [
      {
        text: "Lean into listing posts with an explicit viewing CTA.",
        reason:
          "They carry the highest intent scores in the window, driven by saves and profile clicks well above the account baseline.",
      },
      {
        text: "Investigate the Instagram reach dip flagged in Pulse.",
        reason:
          "IG reach fell ~46% for this brand while peers held steady — a content-side signal, so review recent posts before it compounds.",
      },
      {
        text: "Keep at least one Reel per week in the mix.",
        reason:
          "Video posts outperformed stills on completion and non-follower reach, widening the audience beyond existing followers.",
      },
    ],
  };

  const id = demoId(brand.id, "report");
  const nowIso = now.toISOString();
  await adminDb()
    .doc(`reports/${id}`)
    .set({
      workspaceId: brand.workspaceId,
      title: `${brand.name} — Monthly performance`,
      period,
      from: window.from,
      to: window.to,
      brandIds: [brand.id],
      snapshot,
      narrative,
      publicToken: generatePublicToken(),
      createdBy,
      createdAt: nowIso,
      refreshedAt: nowIso,
      viewCount: 0,
    });

  return 1;
}
