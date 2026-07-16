import type { Pillar, Post, VariantKey } from "@/types";

/**
 * Pillar balance — PURE. No I/O. Compares a brand's actual posting mix against
 * its target pillar percentages, for the Studio balance bar. Kept pure so the
 * bar can be rendered from any post set without an emulator.
 */

export interface PillarBalance {
  name: string;
  color: string;
  targetPct: number;
  actualPct: number;
  /** Signed gap: negative = under-posting this pillar vs target. */
  gapPct: number;
}

/**
 * Compute actual vs target for each pillar from a set of posts.
 *
 * A post counts toward the pillar it's tagged with; untagged posts are ignored
 * (they can't be attributed). Actual % is over tagged posts only, so the bars
 * always sum to ~100 and the comparison is apples-to-apples.
 */
export function computePillarBalance(pillars: Pillar[], posts: Post[]): PillarBalance[] {
  const tagged = posts.filter((p) => p.pillar);
  const total = tagged.length;

  const counts = new Map<string, number>();
  for (const p of tagged) {
    counts.set(p.pillar!, (counts.get(p.pillar!) ?? 0) + 1);
  }

  return pillars.map((pillar) => {
    const count = counts.get(pillar.name) ?? 0;
    const actualPct = total > 0 ? Math.round((count / total) * 100) : 0;
    return {
      name: pillar.name,
      color: pillar.color,
      targetPct: pillar.targetPct,
      actualPct,
      gapPct: actualPct - pillar.targetPct,
    };
  });
}

/** The pillar most under-target — Studio suggests posting more of this one. */
export function mostUnderTarget(balance: PillarBalance[]): PillarBalance | null {
  const under = balance.filter((b) => b.gapPct < 0).sort((a, b) => a.gapPct - b.gapPct);
  return under[0] ?? null;
}

/** Which variant key a post primarily used (for format attribution). */
export function primaryVariant(post: Post): VariantKey | null {
  if (post.variants.instagram) return "instagram";
  if (post.variants.facebook) return "facebook";
  return null;
}
