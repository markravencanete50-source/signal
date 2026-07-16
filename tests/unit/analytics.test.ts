import { describe, expect, it } from "vitest";

import {
  headlineMetrics,
  intentByFormat,
  reachEngagementSeries,
  reachSplit,
} from "@/services/analytics";
import type { MetricsDaily, PostMetrics } from "@/types/metrics";

function daily(date: string, reach: number, engagement = 100, followers = 5000): MetricsDaily {
  return {
    brandId: "b",
    workspaceId: "w",
    platform: "ig",
    date,
    followers,
    reach,
    impressions: reach * 2,
    engagement,
    profileViews: 10,
  };
}

function post(format: PostMetrics["format"], intentScore: number, extra: Partial<PostMetrics> = {}): PostMetrics {
  return {
    postId: "p" + Math.random(),
    brandId: "b",
    workspaceId: "w",
    platform: "ig",
    syncedAt: "2026-07-16T00:00:00Z",
    externalId: "x",
    title: "t",
    format,
    publishedAt: "2026-07-10T00:00:00Z",
    likes: 0,
    comments: 0,
    shares: 0,
    reach: 1000,
    intentScore,
    ...extra,
  };
}

describe("reachEngagementSeries", () => {
  it("sums across platforms per date and sorts chronologically", () => {
    const series = reachEngagementSeries([
      daily("2026-07-02", 500),
      daily("2026-07-01", 300),
      { ...daily("2026-07-01", 200), platform: "fb" },
    ]);
    expect(series.map((s) => s.date)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(series[0]!.reach).toBe(500); // 300 IG + 200 FB same day
  });
});

describe("intentByFormat", () => {
  it("averages intent per format, ordered video → carousel → static", () => {
    const result = intentByFormat([
      post("video", 80),
      post("video", 60),
      post("image", 40),
    ]);
    expect(result).toEqual([
      { format: "video", avgIntent: 70, count: 2 },
      { format: "image", avgIntent: 40, count: 1 },
    ]);
  });
});

describe("reachSplit", () => {
  it("computes the non-follower percentage across posts that report it", () => {
    const split = reachSplit([
      post("image", 50, { reach: 1000, reachNonFollowers: 600 }),
      post("image", 50, { reach: 1000, reachNonFollowers: 400 }),
    ]);
    expect(split).toEqual({ followers: 50, nonFollowers: 50 });
  });

  it("returns null when no post reports non-follower reach (e.g. FB-only)", () => {
    expect(reachSplit([post("image", 50)])).toBeNull();
  });
});

describe("headlineMetrics", () => {
  it("computes the 7-day reach delta vs the prior 7 days", () => {
    const series: MetricsDaily[] = [];
    // prior 7 days: reach 100 each; recent 7 days: reach 200 each.
    for (let i = 13; i >= 7; i--) series.push(daily(`2026-07-${String(20 - i).padStart(2, "0")}`, 100));
    for (let i = 6; i >= 0; i--) series.push(daily(`2026-07-${String(20 - i).padStart(2, "0")}`, 200));

    const h = headlineMetrics(series, [post("image", 80), post("image", 60)]);
    expect(h.reach7d).toBe(1400); // 7 × 200
    expect(h.reachDeltaPct).toBe(100); // doubled vs prior 700
    expect(h.avgIntent).toBe(70);
  });
});
