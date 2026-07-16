import { describe, expect, it } from "vitest";

import { averageRates, computeIntentScore, ratesFromMetrics } from "@/services/intent";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/types";

const W = DEFAULT_WORKSPACE_SETTINGS.intentWeights;

describe("intent score", () => {
  it("scores an exactly-average post at 50", () => {
    const baseline = {
      saveRate: 0.1,
      shareRate: 0.05,
      watchCompletion: 0.5,
      profileClickRate: 0.02,
    };
    const score = computeIntentScore(baseline, baseline, W);
    expect(score).toBe(50);
  });

  it("saturates at 100 when every signal is ≥2× the baseline", () => {
    const baseline = {
      saveRate: 0.1,
      shareRate: 0.05,
      watchCompletion: 0.4,
      profileClickRate: 0.02,
    };
    const strong = { saveRate: 0.3, shareRate: 0.2, watchCompletion: 0.9, profileClickRate: 0.06 };
    expect(computeIntentScore(strong, baseline, W)).toBe(100);
  });

  it("scores a zero-signal post at 0", () => {
    const baseline = {
      saveRate: 0.1,
      shareRate: 0.05,
      watchCompletion: 0.5,
      profileClickRate: 0.02,
    };
    const flop = { saveRate: 0, shareRate: 0, watchCompletion: 0, profileClickRate: 0 };
    expect(computeIntentScore(flop, baseline, W)).toBe(0);
  });

  it("re-normalises weights for a platform missing signals (Facebook)", () => {
    // FB reports only share + profile-click. A post at exactly the baseline on
    // both should still score 50 — not be penalised for missing saves/watch.
    const baseline = { shareRate: 0.05, profileClickRate: 0.02 };
    const fbPost = { shareRate: 0.05, profileClickRate: 0.02 };
    expect(computeIntentScore(fbPost, baseline, W)).toBe(50);
  });

  it("treats a first post (no baseline) as above-nothing", () => {
    const post = { saveRate: 0.1, shareRate: 0.05, watchCompletion: 0.5, profileClickRate: 0.02 };
    // Empty baseline → every present signal normalises to 1 → score 100.
    expect(computeIntentScore(post, {}, W)).toBe(100);
  });
});

describe("ratesFromMetrics", () => {
  it("derives per-reach rates and leaves unreported signals undefined", () => {
    const rates = ratesFromMetrics({ reach: 1000, saves: 100, shares: 50, profileClicks: 20 });
    expect(rates.saveRate).toBeCloseTo(0.1);
    expect(rates.shareRate).toBeCloseTo(0.05);
    expect(rates.profileClickRate).toBeCloseTo(0.02);
    // No completionRate provided → watchCompletion undefined (not 0).
    expect(rates.watchCompletion).toBeUndefined();
  });

  it("returns undefined rates when reach is zero (no division)", () => {
    const rates = ratesFromMetrics({ reach: 0, saves: 5 });
    expect(rates.saveRate).toBeUndefined();
  });
});

describe("averageRates", () => {
  it("ignores undefined so a missing signal doesn't drag the baseline down", () => {
    const avg = averageRates([
      { saveRate: 0.1, shareRate: 0.04 },
      { saveRate: 0.2 }, // no shareRate this time
    ]);
    expect(avg.saveRate).toBeCloseTo(0.15);
    expect(avg.shareRate).toBeCloseTo(0.04); // averaged over the one sample that had it
  });
});
