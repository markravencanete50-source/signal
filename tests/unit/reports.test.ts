import { describe, expect, it } from "vitest";

import { renderSnapshot } from "@/lib/ai/narrative";
import { PERIOD_LABELS, resolvePeriod } from "@/lib/reports/snapshot";
import type { ReportBrandSnapshot } from "@/types";

function snap(overrides: Partial<ReportBrandSnapshot> = {}): ReportBrandSnapshot {
  return {
    brandId: "b1",
    brandName: "House of Lettings",
    followers: null,
    reach: null,
    reachDeltaPct: null,
    avgIntent: null,
    topPosts: [],
    smartlinkClicks: [],
    ...overrides,
  };
}

describe("resolvePeriod", () => {
  // A mid-July reference date, chosen so month boundaries are unambiguous.
  const now = new Date("2026-07-16T09:00:00.000Z");

  it("last-7-days spans 7 inclusive days ending today", () => {
    expect(resolvePeriod("last-7-days", now)).toEqual({ from: "2026-07-10", to: "2026-07-16" });
  });

  it("last-30-days spans 30 inclusive days ending today", () => {
    expect(resolvePeriod("last-30-days", now)).toEqual({ from: "2026-06-17", to: "2026-07-16" });
  });

  it("this-month runs from the 1st to today", () => {
    expect(resolvePeriod("this-month", now)).toEqual({ from: "2026-07-01", to: "2026-07-16" });
  });

  it("last-month covers the whole previous calendar month", () => {
    expect(resolvePeriod("last-month", now)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("has a label for every period", () => {
    for (const key of ["last-7-days", "last-30-days", "this-month", "last-month"] as const) {
      expect(PERIOD_LABELS[key]).toBeTruthy();
    }
  });
});

describe("renderSnapshot grounding", () => {
  it("returns null when no brand has any metric (nothing to narrate)", () => {
    expect(renderSnapshot([snap(), snap({ brandName: "Other" })])).toBeNull();
  });

  it("omits absent metrics so the model cannot cite them", () => {
    const rendered = renderSnapshot([snap({ reach: 12_000, reachDeltaPct: 14 })]);
    expect(rendered).toContain("Reach this period: 12,000 (+14% vs prior window)");
    // Followers and intent were null — they must not appear at all.
    expect(rendered).not.toMatch(/Followers/);
    expect(rendered).not.toMatch(/intent score/i);
  });

  it("includes present metrics and top posts", () => {
    const rendered = renderSnapshot([
      snap({
        followers: 5400,
        avgIntent: 72,
        topPosts: [
          {
            title: "Deposits explained",
            format: "carousel",
            platform: "Instagram",
            intentScore: 88,
            reach: 9000,
            saves: 210,
            shares: 40,
          },
        ],
      }),
    ]);
    expect(rendered).toContain("Followers: 5,400");
    expect(rendered).toContain("Average intent score: 72");
    expect(rendered).toContain('"Deposits explained"');
    expect(rendered).toContain("saves 210");
  });
});
