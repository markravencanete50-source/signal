import { describe, expect, it } from "vitest";

import { detectAnomalies, type BrandReachSeries } from "@/services/anomaly";

/** Build a 14-day series: 7 days at `before`, then 7 at `after`. */
function series(
  brandId: string,
  before: number,
  after: number,
  platform: "fb" | "ig" = "ig",
): BrandReachSeries {
  return {
    brandId,
    platform,
    dailyReach: [...Array(7).fill(before), ...Array(7).fill(after)],
  };
}

describe("anomaly detection", () => {
  it("finds no anomaly when reach is steady", () => {
    expect(detectAnomalies([series("a", 1000, 1000)])).toEqual([]);
  });

  it("finds no anomaly on a drop under the 40% threshold", () => {
    // 30% drop — below threshold.
    expect(detectAnomalies([series("a", 1000, 700)])).toEqual([]);
  });

  it("flags content_side when a single brand drops >40%", () => {
    const result = detectAnomalies([
      series("a", 1000, 500), // 50% drop
      series("b", 1000, 1000), // steady
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ brandId: "a", verdict: "content_side", dropPct: 50 });
  });

  it("flags platform_side when ≥2 brands drop simultaneously (the exit criterion)", () => {
    const result = detectAnomalies([
      series("a", 1000, 500), // 50% drop
      series("b", 2000, 1080), // 46% drop
      series("c", 1000, 1000), // steady — no anomaly
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.verdict === "platform_side")).toBe(true);
    expect(result.map((r) => r.brandId).sort()).toEqual(["a", "b"]);
  });

  it("counts one brand dropping on both platforms as a single brand (still content_side)", () => {
    const result = detectAnomalies([
      series("a", 1000, 400, "ig"), // 60% drop
      series("a", 1000, 400, "fb"), // same brand, other platform
    ]);
    // Two anomalies (one per platform) but ONE distinct brand → content_side.
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.verdict === "content_side")).toBe(true);
  });

  it("ignores series with insufficient history", () => {
    const short: BrandReachSeries = { brandId: "a", platform: "ig", dailyReach: [1000, 900, 800] };
    expect(detectAnomalies([short])).toEqual([]);
  });
});
