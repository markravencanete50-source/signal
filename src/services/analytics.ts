import type { MetricsDaily, PostMetrics } from "@/types/metrics";

/**
 * Analytics shaping — PURE. Turns raw synced docs into the aggregates the
 * Analytics and Dashboard views render. No I/O, so it's unit-testable and the
 * views stay thin.
 */

export interface ReachEngagementPoint {
  date: string;
  reach: number;
  engagement: number;
}

/** Time series for the reach-vs-engagement chart. */
export function reachEngagementSeries(daily: MetricsDaily[]): ReachEngagementPoint[] {
  // Sum across platforms per date (a brand may have both FB and IG).
  const byDate = new Map<string, ReachEngagementPoint>();
  for (const d of daily) {
    const existing = byDate.get(d.date) ?? { date: d.date, reach: 0, engagement: 0 };
    existing.reach += d.reach;
    existing.engagement += d.engagement;
    byDate.set(d.date, existing);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface FormatIntent {
  format: "video" | "carousel" | "image";
  avgIntent: number;
  count: number;
}

/**
 * Average intent by format (Reels / Carousels / Static bars in the preview).
 * Only formats with at least one post appear.
 */
export function intentByFormat(posts: PostMetrics[]): FormatIntent[] {
  const buckets = new Map<FormatIntent["format"], { total: number; count: number }>();
  for (const p of posts) {
    const b = buckets.get(p.format) ?? { total: 0, count: 0 };
    b.total += p.intentScore;
    b.count += 1;
    buckets.set(p.format, b);
  }

  const order: FormatIntent["format"][] = ["video", "carousel", "image"];
  return order
    .filter((f) => buckets.has(f))
    .map((f) => {
      const b = buckets.get(f)!;
      return { format: f, avgIntent: Math.round(b.total / b.count), count: b.count };
    });
}

/**
 * Follower vs non-follower reach split (0–100 each), from the most recent posts
 * that report non-follower reach. Returns null when no post carries the signal
 * (e.g. Facebook-only brands) so the view can hide the panel honestly.
 */
export function reachSplit(
  posts: PostMetrics[],
): { followers: number; nonFollowers: number } | null {
  const withSplit = posts.filter((p) => p.reachNonFollowers !== undefined && p.reach > 0);
  if (withSplit.length === 0) return null;

  const totalReach = withSplit.reduce((s, p) => s + p.reach, 0);
  const totalNonFollower = withSplit.reduce((s, p) => s + (p.reachNonFollowers ?? 0), 0);

  const nonFollowerPct = Math.round((totalNonFollower / totalReach) * 100);
  return { followers: 100 - nonFollowerPct, nonFollowers: nonFollowerPct };
}

/** Dashboard headline metrics from the daily series + post metrics. */
export interface Headline {
  followers: number;
  reach7d: number;
  avgIntent: number;
  reachDeltaPct: number;
  /** Sparkline points (reach per day). */
  reachSpark: number[];
}

export function headlineMetrics(daily: MetricsDaily[], posts: PostMetrics[]): Headline {
  const series = reachEngagementSeries(daily);
  const last14 = series.slice(-14);
  const recent7 = last14.slice(-7);
  const prior7 = last14.slice(0, Math.max(0, last14.length - 7));

  const sum = (pts: ReachEngagementPoint[]) => pts.reduce((s, p) => s + p.reach, 0);
  const reach7d = sum(recent7);
  const priorReach = sum(prior7);
  const reachDeltaPct =
    priorReach > 0 ? Math.round(((reach7d - priorReach) / priorReach) * 100) : 0;

  // Latest known follower count across platforms.
  const followers = daily.length
    ? daily
        .filter(
          (d) =>
            d.date ===
            daily
              .map((x) => x.date)
              .sort()
              .at(-1),
        )
        .reduce((s, d) => s + d.followers, 0)
    : 0;

  const avgIntent = posts.length
    ? Math.round(posts.reduce((s, p) => s + p.intentScore, 0) / posts.length)
    : 0;

  return {
    followers,
    reach7d,
    avgIntent,
    reachDeltaPct,
    reachSpark: recent7.map((p) => p.reach),
  };
}
