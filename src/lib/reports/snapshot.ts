import "server-only";

import { getBrand } from "../db/brands";
import { listDaily, listPostMetrics } from "../db/metrics";
import { listAttribution } from "../db/smartlinks";
import type { MetricsDaily } from "@/types/metrics";
import type { ReportBrandSnapshot, ReportPeriod } from "@/types";

/**
 * Report snapshot builder — turns a period + brands into the STORED aggregates a
 * report renders from. Reads only already-synced Firestore data (never the Graph
 * API), so a report is a point-in-time capture that a public viewer can load
 * without any live platform call (DECISIONS #005).
 */

export interface ResolvedPeriod {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

/**
 * Resolve a period label to a concrete date window.
 *
 * `now` is injected rather than read from the clock so the same inputs always
 * produce the same window — callers pass `new Date()` at the edge; tests pass a
 * fixed date.
 */
export function resolvePeriod(period: ReportPeriod, now: Date): ResolvedPeriod {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const to = new Date(now);

  switch (period) {
    case "last-7-days": {
      const from = new Date(now.getTime() - 6 * 86_400_000);
      return { from: day(from), to: day(to) };
    }
    case "last-30-days": {
      const from = new Date(now.getTime() - 29 * 86_400_000);
      return { from: day(from), to: day(to) };
    }
    case "this-month": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { from: day(from), to: day(to) };
    }
    case "last-month": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return { from: day(from), to: day(end) };
    }
  }
}

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
};

/** Build one brand's snapshot for the window. Returns null if the brand is gone. */
export async function buildBrandSnapshot(
  brandId: string,
  window: ResolvedPeriod,
): Promise<ReportBrandSnapshot | null> {
  const brand = await getBrand(brandId);
  if (!brand) return null;

  const [dailyFb, dailyIg, posts, attribution] = await Promise.all([
    listDaily(brandId, "fb", window.from, window.to),
    listDaily(brandId, "ig", window.from, window.to),
    listPostMetrics(brandId, 60),
    listAttribution(brandId),
  ]);

  const daily = [...dailyFb, ...dailyIg].sort((a, b) => a.date.localeCompare(b.date));
  const windowPosts = posts.filter(
    (p) => p.publishedAt.slice(0, 10) >= window.from && p.publishedAt.slice(0, 10) <= window.to,
  );

  return {
    brandId,
    brandName: brand.name,
    followers: latestFollowers(daily),
    reach: daily.length ? daily.reduce((s, d) => s + d.reach, 0) : null,
    reachDeltaPct: reachDelta(daily),
    avgIntent: windowPosts.length
      ? Math.round(windowPosts.reduce((s, p) => s + p.intentScore, 0) / windowPosts.length)
      : null,
    topPosts: [...windowPosts]
      .sort((a, b) => b.intentScore - a.intentScore)
      .slice(0, 5)
      .map((p) => ({
        title: p.title,
        format: p.format,
        platform: p.platform === "ig" ? "Instagram" : "Facebook",
        intentScore: p.intentScore,
        reach: p.reach,
        // Omit `saves` entirely when the platform doesn't report it (Facebook):
        // Firestore rejects a nested `undefined`, so writing the report doc would
        // throw. The field is optional, so an absent key is the correct shape.
        ...(p.saves !== undefined ? { saves: p.saves } : {}),
        shares: p.shares,
      })),
    smartlinkClicks: attribution
      .slice(0, 8)
      .map((a) => ({ postTitle: a.postTitle, clicks: a.clicks })),
  };
}

export async function buildSnapshot(
  brandIds: string[],
  window: ResolvedPeriod,
): Promise<ReportBrandSnapshot[]> {
  const snaps = await Promise.all(brandIds.map((id) => buildBrandSnapshot(id, window)));
  return snaps.filter((s): s is ReportBrandSnapshot => s !== null);
}

function latestFollowers(daily: MetricsDaily[]): number | null {
  if (daily.length === 0) return null;
  const latestDate = daily[daily.length - 1]!.date;
  return daily.filter((d) => d.date === latestDate).reduce((s, d) => s + d.followers, 0);
}

/**
 * Reach change vs. the equally-long window immediately before. Needs at least
 * two full windows of data (14 days for a weekly view), else null — a delta from
 * a partial baseline would mislead.
 */
function reachDelta(daily: MetricsDaily[]): number | null {
  if (daily.length < 14) return null;
  const half = Math.floor(daily.length / 2);
  const prior = daily.slice(0, half).reduce((s, d) => s + d.reach, 0);
  const recent = daily.slice(half).reduce((s, d) => s + d.reach, 0);
  if (prior <= 0) return null;
  return Math.round(((recent - prior) / prior) * 100);
}
