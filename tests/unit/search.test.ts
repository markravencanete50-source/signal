import { describe, expect, it } from "vitest";

import { rankResults, scoreItem, scoreText, type Searchable } from "@/services/search";

function item(over: Partial<Searchable> & { title: string }): Searchable {
  return { type: "post", id: over.title, href: "/planner", ...over };
}

describe("scoreText", () => {
  it("ranks prefix > word-start > substring > none", () => {
    expect(scoreText("head", "Headingley flat")).toBe(3); // prefix
    expect(scoreText("flat", "Headingley flat")).toBe(2); // word start
    expect(scoreText("ding", "Headingley flat")).toBe(1); // substring
    expect(scoreText("xyz", "Headingley flat")).toBe(0);
  });

  it("is case-insensitive and splits on punctuation", () => {
    expect(scoreText("DEP", "deposit_guide.png")).toBe(3);
    expect(scoreText("guide", "deposit_guide.png")).toBe(2);
  });

  it("returns 0 for empty query or text", () => {
    expect(scoreText("", "anything")).toBe(0);
    expect(scoreText("q", "")).toBe(0);
  });
});

describe("scoreItem", () => {
  it("weights a title hit above a subtitle hit", () => {
    const titleHit = item({ title: "Deposit guide", subtitle: "Something else" });
    const subtitleHit = item({ title: "Something else", subtitle: "Deposit guide" });
    expect(scoreItem("deposit", titleHit)).toBeGreaterThan(scoreItem("deposit", subtitleHit));
  });

  it("matches against keywords when title/subtitle miss", () => {
    const withKw = item({ title: "IMG_2043", keywords: ["kitchen", "refurb"] });
    expect(scoreItem("kitchen", withKw)).toBeGreaterThan(0);
  });
});

describe("rankResults", () => {
  const items = [
    item({ title: "Headingley 2-bed", id: "a" }),
    item({ title: "Head office update", id: "b" }),
    item({ title: "A post mentioning headboards", id: "c" }),
    item({ title: "Unrelated", id: "d" }),
  ];

  it("drops non-matches and orders by relevance", () => {
    const results = rankResults("head", items);
    expect(results.map((r) => r.id)).not.toContain("d");
    // "Headingley 2-bed" (16) and "Head office update" (18) are both prefixes
    // (score 3); the shorter title wins the tiebreak.
    expect(results[0]!.id).toBe("a");
  });

  it("respects the limit", () => {
    expect(rankResults("head", items, 1)).toHaveLength(1);
  });

  it("strips the internal keywords field from results", () => {
    const results = rankResults("kitchen", [item({ title: "x", keywords: ["kitchen"] })]);
    expect(results[0]).not.toHaveProperty("keywords");
  });
});
