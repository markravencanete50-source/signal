import { describe, expect, it } from "vitest";

import { renderDataPack, type BrandDataPack } from "@/lib/ai/brand-context";
import type { Brand } from "@/types";

/**
 * Grounding-mechanism test. `renderDataPack` is what the AI features feed to
 * Claude, and the "never invent numbers" contract depends on it emitting ONLY
 * numbers that are actually present. This proves that: a metric the brand
 * doesn't have never appears in the rendered prompt, so the model can't cite it.
 */

const brand: Brand = {
  id: "b",
  workspaceId: "w",
  name: "House of Lettings",
  timezone: "Europe/London",
  color: "var(--chart-2)",
  pillars: [
    { name: "Listings", color: "var(--chart-1)", targetPct: 40 },
    { name: "Education", color: "var(--chart-2)", targetPct: 30 },
  ],
};

describe("renderDataPack grounding", () => {
  it("emits the numbers the brand has", () => {
    const pack: BrandDataPack = {
      brand,
      hasData: true,
      followers: 12840,
      reach7d: 48200,
      reach7dDeltaPct: -8,
      avgIntent: 71,
      intentByFormat: [{ format: "video", avgIntent: 82, count: 5 }],
      reachSplit: { followers: 48, nonFollowers: 52 },
      topPosts: [
        {
          title: "Landlord checklist",
          format: "carousel",
          platform: "Instagram",
          intentScore: 86,
          saves: 312,
          shares: 148,
          reach: 9000,
          completionRate: undefined,
          publishedAt: "2026-07-14T00:00:00Z",
        },
      ],
    };

    const text = renderDataPack(pack);
    expect(text).toContain("House of Lettings");
    expect(text).toContain("12,840"); // followers
    expect(text).toContain("48,200"); // reach
    expect(text).toContain("-8% vs prior 7 days");
    expect(text).toContain("intent 86");
    expect(text).toContain("saves 312");
    expect(text).toContain("video 82");
  });

  it("omits metrics the brand does NOT have, so they can't be cited", () => {
    const pack: BrandDataPack = {
      brand,
      hasData: true,
      followers: null, // no follower data
      reach7d: null, // no reach data
      reach7dDeltaPct: null,
      avgIntent: null,
      intentByFormat: [],
      reachSplit: null, // FB-only brand — no non-follower split
      topPosts: [],
    };

    const text = renderDataPack(pack);
    // None of the missing signals should appear as a labelled line.
    expect(text).not.toContain("Followers:");
    expect(text).not.toContain("Reach, last 7 days:");
    expect(text).not.toContain("Average intent score:");
    expect(text).not.toContain("Reach split:");
    // The brand name and pillars (which it does have) still render.
    expect(text).toContain("House of Lettings");
    expect(text).toContain("Content pillars");
  });

  it("omits a post's watch % when the platform didn't report it", () => {
    const pack: BrandDataPack = {
      brand,
      hasData: true,
      followers: 100,
      reach7d: null,
      reach7dDeltaPct: null,
      avgIntent: 50,
      intentByFormat: [],
      reachSplit: null,
      topPosts: [
        {
          title: "A photo",
          format: "image",
          platform: "Facebook",
          intentScore: 40,
          saves: undefined, // FB doesn't report saves
          shares: 12,
          reach: 500,
          completionRate: undefined, // no watch time on a still
          publishedAt: "2026-07-10T00:00:00Z",
        },
      ],
    };

    const text = renderDataPack(pack);
    expect(text).toContain("shares 12");
    expect(text).not.toContain("saves"); // absent signal not fabricated
    expect(text).not.toContain("watch");
  });
});
