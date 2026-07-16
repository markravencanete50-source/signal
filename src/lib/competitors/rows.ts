import "server-only";

import { getBrand } from "../db/brands";
import { listCompetitors } from "../db/competitors";
import { listDaily, listPostMetrics } from "../db/metrics";
import type { CompetitorRow } from "../ai/competitor-insight";
import type { MetricsDaily } from "@/types/metrics";

/**
 * Build the competitor comparison table rows — the user's own account plus every
 * tracked competitor — on one comparable footing. Both the table and the AI
 * insight endpoint read from here so their numbers never disagree.
 *
 * Engagement rate is expressed per-follower for everyone: competitor rates come
 * from Business Discovery (likes+comments ÷ followers), so the user's row uses
 * the same denominator rather than the more common per-reach rate.
 */
export async function buildCompetitorRows(brandId: string): Promise<CompetitorRow[]> {
  const [brand, competitors] = await Promise.all([getBrand(brandId), listCompetitors(brandId)]);
  if (!brand) return [];

  const you = await buildYourRow(brandId, brand.name);

  const competitorRows: CompetitorRow[] = competitors
    .filter((c) => c.latest)
    .map((c) => ({
      competitorId: c.id,
      name: c.displayName,
      isYou: false,
      followers: c.latest!.followers,
      growth30dPct: c.growth30dPct,
      postsPerWeek: Math.round((c.latest!.postsLast30d / 4.3) * 10) / 10,
      avgEngagementRatePct: Math.round(c.latest!.avgEngagementRate * 1000) / 10,
    }));

  return [you, ...competitorRows];
}

async function buildYourRow(brandId: string, name: string): Promise<CompetitorRow> {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);

  const [dailyFb, dailyIg, posts] = await Promise.all([
    listDaily(brandId, "fb", fromDate, toDate),
    listDaily(brandId, "ig", fromDate, toDate),
    listPostMetrics(brandId, 60),
  ]);
  const daily = [...dailyFb, ...dailyIg].sort((a, b) => a.date.localeCompare(b.date));

  const followers = latestFollowers(daily);
  const windowPosts = posts.filter((p) => p.publishedAt.slice(0, 10) >= fromDate);

  const engagementPerFollower =
    windowPosts.length && followers > 0
      ? windowPosts.reduce(
          (s, p) => s + (p.likes + p.comments + p.shares + (p.saves ?? 0)) / followers,
          0,
        ) / windowPosts.length
      : 0;

  return {
    name,
    isYou: true,
    followers,
    growth30dPct: followerGrowth(daily),
    postsPerWeek: Math.round((windowPosts.length / 4.3) * 10) / 10,
    avgEngagementRatePct: Math.round(engagementPerFollower * 1000) / 10,
  };
}

function latestFollowers(daily: MetricsDaily[]): number {
  if (daily.length === 0) return 0;
  const latestDate = daily[daily.length - 1]!.date;
  return daily.filter((d) => d.date === latestDate).reduce((s, d) => s + d.followers, 0);
}

/** Follower change from the start of the window to the end, as a percentage. */
function followerGrowth(daily: MetricsDaily[]): number | null {
  if (daily.length === 0) return null;
  const dates = [...new Set(daily.map((d) => d.date))].sort();
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  if (first === last) return null;

  const at = (date: string) =>
    daily.filter((d) => d.date === date).reduce((s, d) => s + d.followers, 0);
  const start = at(first);
  if (start <= 0) return null;
  return Math.round(((at(last) - start) / start) * 1000) / 10;
}
