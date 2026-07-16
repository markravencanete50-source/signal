import type { WorkspaceSettings } from "@/types";

/**
 * Intent scoring — PURE. No I/O. Given a post's raw engagement, the brand's
 * trailing-90-day average rates, and the workspace's configurable weights,
 * returns a 0–100 intent score.
 *
 * Spec formula:
 *   intentScore = 100 × (0.30·saveRate + 0.30·shareRate
 *                        + 0.25·watchCompletion + 0.15·profileClickRate)
 *   rates normalised against the brand's trailing-90-day averages.
 *
 * Two design choices the spec leaves open, both documented in DECISIONS #014:
 *  1. Normalisation curve: a signal at the brand's 90-day average scores 0.5 for
 *     that component, and 2× the average (or better) saturates it at 1.0. So an
 *     exactly-average post lands at 50, a post doubling every signal at 100.
 *  2. Missing signals: Facebook reports no saves/watch-time. Rather than treat
 *     those as zero (which would unfairly tank every FB post), the weights are
 *     re-normalised over only the signals the platform actually reports, so a
 *     score stays comparable within a platform.
 */

/** The four raw rates a post produced. Absent = the platform doesn't report it. */
export interface PostRates {
  saveRate?: number;
  shareRate?: number;
  watchCompletion?: number;
  profileClickRate?: number;
}

/** The brand's trailing-90-day average of each rate. */
export type BaselineRates = PostRates;

type SignalKey = keyof PostRates;

const WEIGHT_KEYS: Record<SignalKey, keyof WorkspaceSettings["intentWeights"]> = {
  saveRate: "saveRate",
  shareRate: "shareRate",
  watchCompletion: "watchCompletion",
  profileClickRate: "profileClickRate",
};

/**
 * Normalise one signal against its baseline.
 *
 * - No baseline yet (avg ≤ 0): a non-zero rate reads as "above nothing" → 1,
 *   zero → 0. Avoids dividing by zero on a brand's first posts.
 * - Otherwise: ratio to average, clamped to [0,2], halved → average maps to 0.5.
 */
function normaliseSignal(rate: number, avg: number | undefined): number {
  if (avg === undefined || avg <= 0) return rate > 0 ? 1 : 0;
  const ratio = rate / avg;
  return Math.min(Math.max(ratio, 0), 2) / 2;
}

/**
 * Compute a post's intent score in [0,100].
 *
 * Only the signals present in `rates` contribute; their weights are re-normalised
 * to sum to 1 so a Facebook post (share + profile-click only) isn't penalised for
 * lacking Instagram-only signals.
 */
export function computeIntentScore(
  rates: PostRates,
  baseline: BaselineRates,
  weights: WorkspaceSettings["intentWeights"],
): number {
  const present = (Object.keys(WEIGHT_KEYS) as SignalKey[]).filter((k) => rates[k] !== undefined);

  if (present.length === 0) return 0;

  const totalWeight = present.reduce((sum, k) => sum + weights[WEIGHT_KEYS[k]], 0);
  if (totalWeight <= 0) return 0;

  const score = present.reduce((sum, k) => {
    const normalised = normaliseSignal(rates[k]!, baseline[k]);
    const reweighted = weights[WEIGHT_KEYS[k]] / totalWeight;
    return sum + reweighted * normalised;
  }, 0);

  return Math.round(Math.min(Math.max(score, 0), 1) * 100);
}

/**
 * Derive per-post rates from raw metrics + reach.
 *
 * saveRate/shareRate/profileClickRate are per-reach; watchCompletion is already
 * a 0–1 fraction from the platform. A signal the platform didn't report stays
 * undefined so it's excluded from scoring, never counted as zero.
 */
export function ratesFromMetrics(m: {
  reach: number;
  saves?: number;
  shares?: number;
  profileClicks?: number;
  completionRate?: number;
}): PostRates {
  const perReach = (n: number | undefined) =>
    n === undefined || m.reach <= 0 ? undefined : n / m.reach;

  return {
    saveRate: perReach(m.saves),
    shareRate: perReach(m.shares),
    profileClickRate: perReach(m.profileClicks),
    watchCompletion: m.completionRate,
  };
}

/**
 * Average a set of rate observations, ignoring undefined so a platform's missing
 * signal doesn't drag the baseline toward zero. Returns undefined for a signal
 * with no observations.
 */
export function averageRates(samples: PostRates[]): BaselineRates {
  const keys = Object.keys(WEIGHT_KEYS) as SignalKey[];
  const result: BaselineRates = {};

  for (const key of keys) {
    const values = samples.map((s) => s[key]).filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      result[key] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  return result;
}
