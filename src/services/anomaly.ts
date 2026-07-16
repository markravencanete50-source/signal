/**
 * Anomaly detection — PURE. No I/O.
 *
 * Spec: if a brand's reach 7-day average drops >40% vs the prior 7 days, that's
 * an anomaly. The verdict depends on whether it's isolated or account-wide:
 *   - simultaneous across ≥2 brands of the workspace → `platform_side`
 *     (the algorithm changed, not your content)
 *   - just one brand → `content_side` (something about that brand's content)
 *
 * This distinction is Signal's whole "is it you, or is it the algorithm?" pitch,
 * so it's isolated here as a pure function and unit-tested directly.
 */

export type Verdict = "platform_side" | "content_side";

/** A brand's daily reach series, oldest → newest, for a single platform. */
export interface BrandReachSeries {
  brandId: string;
  platform: "fb" | "ig";
  /** At least 14 entries; only the last 14 are used. */
  dailyReach: number[];
}

export interface DetectedAnomaly {
  brandId: string;
  platform: "fb" | "ig";
  verdict: Verdict;
  /** Positive percentage drop, e.g. 46 for a 46% fall. */
  dropPct: number;
}

const DROP_THRESHOLD = 0.4; // >40%

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Does this brand's reach show a >40% drop, last 7 days vs the prior 7?
 * Returns the drop fraction (0–1) if so, else null.
 */
function dropFraction(dailyReach: number[]): number | null {
  const last14 = dailyReach.slice(-14);
  if (last14.length < 14) return null;

  const prior7 = mean(last14.slice(0, 7));
  const recent7 = mean(last14.slice(7));

  if (prior7 <= 0) return null; // no baseline to fall from

  const drop = (prior7 - recent7) / prior7;
  return drop > DROP_THRESHOLD ? drop : null;
}

/**
 * Detect anomalies across a workspace's brands.
 *
 * Each series is one brand+platform. A brand appears anomalous if any of its
 * platforms dropped. The verdict is assigned per anomalous brand based on how
 * many DISTINCT brands dropped across the whole workspace at once:
 *   ≥2 brands → platform_side for all of them; exactly 1 → content_side.
 *
 * Grouping by distinct brand (not brand+platform) matters: one brand dropping on
 * both FB and IG is still one brand, and shouldn't be mistaken for a platform-
 * wide event.
 */
export function detectAnomalies(series: BrandReachSeries[]): DetectedAnomaly[] {
  const drops: Array<{ brandId: string; platform: "fb" | "ig"; drop: number }> = [];

  for (const s of series) {
    const drop = dropFraction(s.dailyReach);
    if (drop !== null) {
      drops.push({ brandId: s.brandId, platform: s.platform, drop });
    }
  }

  const distinctBrands = new Set(drops.map((d) => d.brandId));
  const verdict: Verdict = distinctBrands.size >= 2 ? "platform_side" : "content_side";

  return drops.map((d) => ({
    brandId: d.brandId,
    platform: d.platform,
    verdict,
    dropPct: Math.round(d.drop * 100),
  }));
}
