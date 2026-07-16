import "server-only";

import { listDaily, listPostMetrics } from "../db/metrics";
import { getBrand } from "../db/brands";
import type { Brand } from "@/types";
import type { PostMetrics } from "@/types/metrics";
import { intentByFormat, reachSplit } from "@/services/analytics";

/**
 * Brand data pack — the grounding layer for every AI feature (Studio
 * suggestions, Ask Signal). It assembles ONLY facts already in Firestore into a
 * compact structure, which is then rendered into the prompt.
 *
 * This is what makes "grounded in real metrics" true rather than aspirational:
 * the model is given exactly these numbers and instructed to cite only these.
 * Nothing here is invented — every field is read from synced data.
 */

export interface BrandDataPack {
  brand: Brand;
  hasData: boolean;
  followers: number | null;
  reach7d: number | null;
  reach7dDeltaPct: number | null;
  avgIntent: number | null;
  intentByFormat: Array<{ format: string; avgIntent: number; count: number }>;
  reachSplit: { followers: number; nonFollowers: number } | null;
  /** The brand's recent posts, best-scoring first — the evidence base. */
  topPosts: Array<{
    title: string;
    format: string;
    platform: string;
    intentScore: number;
    saves?: number;
    shares: number;
    reach: number;
    completionRate?: number;
    publishedAt: string;
  }>;
}

export async function buildBrandDataPack(brandId: string): Promise<BrandDataPack | null> {
  const brand = await getBrand(brandId);
  if (!brand) return null;

  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);

  const [dailyFb, dailyIg, posts] = await Promise.all([
    listDaily(brandId, "fb", fromDate, toDate),
    listDaily(brandId, "ig", fromDate, toDate),
    listPostMetrics(brandId, 40),
  ]);

  const daily = [...dailyFb, ...dailyIg].sort((a, b) => a.date.localeCompare(b.date));
  const hasData = daily.length > 0 || posts.length > 0;

  return {
    brand,
    hasData,
    followers: latestFollowers(daily),
    reach7d: sumReach(daily.slice(-7)),
    reach7dDeltaPct: reachDelta(daily),
    avgIntent: posts.length
      ? Math.round(posts.reduce((s, p) => s + p.intentScore, 0) / posts.length)
      : null,
    intentByFormat: intentByFormat(posts),
    reachSplit: reachSplit(posts),
    topPosts: [...posts]
      .sort((a, b) => b.intentScore - a.intentScore)
      .slice(0, 10)
      .map(toPostSummary),
  };
}

/**
 * Render the pack as a plain-text block for a prompt. Only present numbers are
 * emitted, so the model literally cannot see (and shouldn't cite) a metric the
 * brand doesn't have yet.
 */
export function renderDataPack(pack: BrandDataPack): string {
  const lines: string[] = [`Brand: ${pack.brand.name}`];

  if (pack.followers !== null) lines.push(`Followers: ${pack.followers.toLocaleString()}`);
  if (pack.reach7d !== null) {
    const delta =
      pack.reach7dDeltaPct !== null ? ` (${signed(pack.reach7dDeltaPct)}% vs prior 7 days)` : "";
    lines.push(`Reach, last 7 days: ${pack.reach7d.toLocaleString()}${delta}`);
  }
  if (pack.avgIntent !== null) lines.push(`Average intent score: ${pack.avgIntent}`);

  if (pack.intentByFormat.length) {
    lines.push(
      "Avg intent by format: " +
        pack.intentByFormat.map((f) => `${f.format} ${f.avgIntent} (${f.count} posts)`).join(", "),
    );
  }
  if (pack.reachSplit) {
    lines.push(
      `Reach split: ${pack.reachSplit.nonFollowers}% non-followers, ${pack.reachSplit.followers}% followers`,
    );
  }

  lines.push(
    `Content pillars (target %): ${pack.brand.pillars.map((p) => `${p.name} ${p.targetPct}%`).join(", ")}`,
  );

  if (pack.topPosts.length) {
    lines.push("\nRecent posts (best intent first):");
    for (const p of pack.topPosts) {
      const parts = [
        `- "${p.title}"`,
        `[${p.format}, ${p.platform}]`,
        `intent ${p.intentScore}`,
        p.saves !== undefined ? `saves ${p.saves}` : null,
        `shares ${p.shares}`,
        p.completionRate !== undefined ? `watch ${Math.round(p.completionRate * 100)}%` : null,
      ].filter(Boolean);
      lines.push(parts.join(" · "));
    }
  }

  return lines.join("\n");
}

function toPostSummary(p: PostMetrics) {
  return {
    title: p.title,
    format: p.format,
    platform: p.platform === "ig" ? "Instagram" : "Facebook",
    intentScore: p.intentScore,
    saves: p.saves,
    shares: p.shares,
    reach: p.reach,
    completionRate: p.completionRate,
    publishedAt: p.publishedAt,
  };
}

function latestFollowers(daily: { date: string; followers: number }[]): number | null {
  if (daily.length === 0) return null;
  const latestDate = daily[daily.length - 1]!.date;
  return daily.filter((d) => d.date === latestDate).reduce((s, d) => s + d.followers, 0);
}

function sumReach(daily: { reach: number }[]): number | null {
  if (daily.length === 0) return null;
  return daily.reduce((s, d) => s + d.reach, 0);
}

function reachDelta(daily: { reach: number }[]): number | null {
  if (daily.length < 14) return null;
  const last7 = daily.slice(-7).reduce((s, d) => s + d.reach, 0);
  const prior7 = daily.slice(-14, -7).reduce((s, d) => s + d.reach, 0);
  if (prior7 <= 0) return null;
  return Math.round(((last7 - prior7) / prior7) * 100);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}
