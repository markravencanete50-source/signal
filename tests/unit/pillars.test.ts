import { describe, expect, it } from "vitest";

import { computePillarBalance, mostUnderTarget } from "@/services/pillars";
import type { Pillar, Post } from "@/types";

const pillars: Pillar[] = [
  { name: "Listings", color: "var(--chart-1)", targetPct: 40 },
  { name: "Education", color: "var(--chart-2)", targetPct: 30 },
  { name: "Team", color: "var(--chart-3)", targetPct: 30 },
];

function post(pillar?: string): Post {
  return {
    id: Math.random().toString(),
    brandId: "b",
    workspaceId: "w",
    createdBy: "u",
    status: "published",
    attempts: 0,
    variants: {},
    pillar,
  };
}

describe("pillar balance", () => {
  it("computes actual vs target over tagged posts only", () => {
    // 4 Listings, 1 Education, 0 Team → 80/20/0.
    const posts = [
      post("Listings"),
      post("Listings"),
      post("Listings"),
      post("Listings"),
      post("Education"),
      post(),
    ];
    const balance = computePillarBalance(pillars, posts);

    expect(balance.find((b) => b.name === "Listings")).toMatchObject({ actualPct: 80, gapPct: 40 });
    expect(balance.find((b) => b.name === "Education")).toMatchObject({
      actualPct: 20,
      gapPct: -10,
    });
    expect(balance.find((b) => b.name === "Team")).toMatchObject({ actualPct: 0, gapPct: -30 });
  });

  it("returns all-zero actuals when nothing is tagged", () => {
    const balance = computePillarBalance(pillars, [post(), post()]);
    expect(balance.every((b) => b.actualPct === 0)).toBe(true);
  });

  it("identifies the most under-target pillar", () => {
    const posts = [post("Listings"), post("Listings"), post("Education")];
    const under = mostUnderTarget(computePillarBalance(pillars, posts));
    // Team is 0% vs 30% target → most under.
    expect(under?.name).toBe("Team");
  });
});
