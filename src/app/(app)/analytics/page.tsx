import type { ReactNode } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { IntentRing } from "@/components/ui/intent-ring";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { ReachChart } from "@/components/charts/reach-chart";
import { listConnectionsForBrand, toPublicConnection } from "@/lib/db/connections";
import { listDaily, listPostMetrics } from "@/lib/db/metrics";
import { getAppContext } from "@/lib/workspace-context";
import { intentByFormat, reachEngagementSeries, reachSplit } from "@/services/analytics";
import { PLATFORM_LABEL, type Platform, type PublicConnection } from "@/types";

export const metadata = { title: "Analytics — Signal" };

const FORMAT_LABEL = { video: "Reels", carousel: "Carousels", image: "Static" };

/**
 * Analytics view — real synced metrics. Reach/engagement chart (theme-aware
 * recharts), intent-by-format bars, follower/non-follower split, and the sortable
 * post table with score rings. Client-visible (all roles).
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { activeBrand } = await getAppContext();
  const params = await searchParams;
  const days = params.days === "7" ? 7 : params.days === "90" ? 90 : 30;

  if (!activeBrand) {
    return <Empty title="No brand selected" body="Create a brand to see its analytics." />;
  }

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);

  // Pull daily for both platforms + recent post metrics.
  const [dailyFb, dailyIg, posts] = await Promise.all([
    listDaily(activeBrand.id, "fb", fromDate, toDate),
    listDaily(activeBrand.id, "ig", fromDate, toDate),
    listPostMetrics(activeBrand.id, 60),
  ]);

  const daily = [...dailyFb, ...dailyIg];
  const series = reachEngagementSeries(daily);
  const formats = intentByFormat(posts);
  const split = reachSplit(posts);
  const sortedPosts = [...posts].sort((a, b) => b.intentScore - a.intentScore).slice(0, 12);

  const hasData = daily.length > 0 || posts.length > 0;

  return (
    <>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Analytics</h1>
          <p className="text-text-2 mt-[3px] text-[0.88rem]">
            {activeBrand.name} · Facebook + Instagram
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <a
              key={d}
              href={`/analytics?days=${d}`}
              className={`rounded-full border px-3.5 py-[7px] text-[0.82rem] font-medium ${
                days === d
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border bg-surface text-text-2"
              }`}
            >
              {d}d
            </a>
          ))}
        </div>
      </div>

      {!hasData ? (
        <NoMetrics
          connections={(await listConnectionsForBrand(activeBrand.id)).map(toPublicConnection)}
        />
      ) : (
        <>
          <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardTitle>Reach vs engagement</CardTitle>
              <div className="text-text-2 mb-3.5 flex gap-4 text-[0.78rem]">
                <Legend color="var(--chart-1)" label="Reach" />
                <Legend color="var(--chart-2)" label="Engagement" />
              </div>
              {series.length > 1 ? (
                <ReachChart data={series} />
              ) : (
                <p className="text-text-2 py-12 text-center text-[0.85rem]">
                  Not enough days synced yet to draw a trend.
                </p>
              )}
            </Card>

            <div className="flex flex-col gap-3.5">
              <Card>
                <CardTitle>Avg intent by format</CardTitle>
                {formats.length === 0 ? (
                  <p className="text-text-2 text-[0.85rem]">No scored posts yet.</p>
                ) : (
                  formats.map((f) => (
                    <div key={f.format} className="mb-3.5 flex items-center gap-3 last:mb-0">
                      <label className="w-[74px] shrink-0 text-[0.82rem] font-medium">
                        {FORMAT_LABEL[f.format]}
                      </label>
                      <div className="bg-surface-2 h-[26px] flex-1 overflow-hidden rounded-lg">
                        <i
                          className="block h-full rounded-lg"
                          style={{
                            width: `${f.avgIntent}%`,
                            background: "linear-gradient(90deg,var(--accent),var(--chart-2))",
                          }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[0.9rem] font-bold">
                        {f.avgIntent}
                      </span>
                    </div>
                  ))
                )}
              </Card>

              {split && (
                <Card>
                  <CardTitle>Reach split</CardTitle>
                  <div className="my-3.5 flex h-3.5 overflow-hidden rounded-lg">
                    <i style={{ width: `${split.nonFollowers}%`, background: "var(--accent)" }} />
                    <i style={{ width: `${split.followers}%`, background: "var(--chart-2)" }} />
                  </div>
                  <div className="text-text-2 flex justify-between text-[0.78rem]">
                    <span>
                      <b className="text-text-1">{split.nonFollowers}%</b> non-followers
                    </span>
                    <span>
                      <b className="text-text-1">{split.followers}%</b> followers
                    </span>
                  </div>
                  <p className="text-text-2 mt-3 text-[0.78rem] leading-relaxed">
                    {split.nonFollowers >= 50
                      ? "Over half your reach comes from discovery — the algorithm is recommending you to new audiences."
                      : "Most reach is still from your existing followers."}
                  </p>
                </Card>
              )}
            </div>
          </div>

          <Card>
            <CardTitle>Post performance</CardTitle>
            {sortedPosts.length === 0 ? (
              <p className="text-text-2 text-[0.85rem]">No post metrics synced yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Post", "Platform", "Saves", "Shares", "Watch %", "Intent"].map((h) => (
                        <th
                          key={h}
                          className="border-border text-text-2 border-b px-3 py-2.5 text-left text-[0.7rem] font-semibold tracking-[0.06em] uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPosts.map((p) => (
                      <tr key={`${p.postId}_${p.platform}`}>
                        <td className="border-border border-b px-3 py-3">
                          <p className="max-w-[260px] truncate text-[0.85rem] font-medium">
                            {p.title}
                          </p>
                          <small className="text-text-2 text-[0.74rem]">
                            {new Date(p.publishedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })}{" "}
                            · {FORMAT_LABEL[p.format]}
                          </small>
                        </td>
                        <td className="border-border border-b px-3 py-3">
                          <PlatformIcon platform={p.platform as Platform} size={22} />
                        </td>
                        <td className="border-border border-b px-3 py-3 text-[0.85rem] font-semibold">
                          {p.saves ?? "—"}
                        </td>
                        <td className="border-border border-b px-3 py-3 text-[0.85rem] font-semibold">
                          {p.shares}
                        </td>
                        <td className="border-border border-b px-3 py-3 text-[0.85rem] font-semibold">
                          {p.completionRate !== undefined
                            ? `${Math.round(p.completionRate * 100)}%`
                            : "—"}
                        </td>
                        <td className="border-border border-b px-3 py-3">
                          <IntentRing score={p.intentScore} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <i className="inline-block size-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <>
      <div className="mb-[22px]">
        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Analytics</h1>
      </div>
      <div className="border-border grid min-h-[280px] place-items-center rounded-2xl border-[1.5px] border-dashed p-8 text-center">
        <div className="max-w-[400px]">
          <p className="text-[0.95rem] font-semibold">{title}</p>
          <p className="text-text-2 mt-1.5 text-[0.85rem] leading-relaxed">{body}</p>
        </div>
      </div>
    </>
  );
}

/**
 * Empty-analytics diagnosis, derived from the brand's connections.
 *
 * "No metrics yet" has three very different causes, and the old blanket copy hid
 * which one you're in. We already know the page has no data; pairing that with
 * each connection's sync status tells the real story: nothing connected, synced-
 * but-Facebook-returned-nothing (the follower-threshold / posted-outside-Signal
 * case), or simply never synced. Each gets its own copy and CTA.
 */
function NoMetrics({ connections }: { connections: PublicConnection[] }) {
  const connected = connections.length > 0;
  const lastSync = connections
    .map((c) => c.lastSyncAt)
    .filter((s): s is string => Boolean(s))
    .sort()
    .at(-1);

  let title: string;
  let body: ReactNode;
  let cta: { href: string; label: string };

  if (!connected) {
    title = "No account connected";
    body = "Signal can’t measure anything until you connect a Facebook Page or Instagram account.";
    cta = { href: "/settings/connections", label: "Connect an account" };
  } else if (!lastSync) {
    title = "Waiting for the first sync";
    body =
      "This account is connected but hasn’t synced yet. Sync runs hourly — or trigger it now and watch the result.";
    cta = { href: "/settings/connections", label: "Run sync now" };
  } else {
    title = "Connected, but no data returned yet";
    body = (
      <>
        Last synced {syncedAgo(lastSync)}, but Facebook returned nothing to store. Two common
        reasons: a Page reports Page-level insights only after it passes Facebook’s follower
        threshold (≈100 follows), and Signal measures per-post metrics only for posts{" "}
        <strong className="text-text-1">published through Signal</strong> — a post made directly on
        Facebook won’t show here. Run a sync to see the exact per-account counts.
      </>
    );
    cta = { href: "/settings/connections", label: "Run sync now" };
  }

  return (
    <>
      <div className="mb-[22px]">
        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Analytics</h1>
      </div>

      {connected && (
        <div className="mb-3.5 flex flex-wrap gap-2">
          {connections.map((c) => (
            <span
              key={c.id}
              className="border-border bg-surface text-text-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[0.76rem] font-medium"
            >
              <PlatformIcon platform={c.platform} size={16} />
              {PLATFORM_LABEL[c.platform]} ·{" "}
              {c.lastSyncAt ? `synced ${syncedAgo(c.lastSyncAt)}` : "not synced yet"}
            </span>
          ))}
        </div>
      )}

      <div className="border-border grid min-h-[240px] place-items-center rounded-2xl border-[1.5px] border-dashed p-8 text-center">
        <div className="max-w-[440px]">
          <p className="text-[0.95rem] font-semibold">{title}</p>
          <p className="text-text-2 mt-1.5 text-[0.85rem] leading-relaxed">{body}</p>
          <a
            href={cta.href}
            className="bg-accent text-accent-fg mt-4 inline-flex items-center rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold"
          >
            {cta.label}
          </a>
        </div>
      </div>
    </>
  );
}

/** Compact "just now / 2h ago" for a last-sync timestamp. */
function syncedAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
