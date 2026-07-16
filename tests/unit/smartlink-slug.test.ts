import { describe, expect, it } from "vitest";

import { initials, slugify, uniqueSlug } from "@/lib/smartlink/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("House of Lettings")).toBe("house-of-lettings");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("  Ace & Co.!!  Ltd ")).toBe("ace-co-ltd");
  });

  it("removes accents", () => {
    expect(slugify("Café Málaga")).toBe("cafe-malaga");
  });

  it("caps length", () => {
    expect(slugify("a".repeat(80)).length).toBe(40);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("House of Lettings", new Set())).toBe("house-of-lettings");
  });

  it("appends the first free suffix on collision", () => {
    const taken = new Set(["acme", "acme-2"]);
    expect(uniqueSlug("Acme", taken)).toBe("acme-3");
  });

  it("falls back to 'brand' when the name has no slug-able characters", () => {
    expect(uniqueSlug("!!!", new Set())).toBe("brand");
  });
});

describe("initials", () => {
  it("takes first+last initials for multi-word names", () => {
    expect(initials("House of Lettings")).toBe("HL");
  });

  it("takes the first two letters of a single word", () => {
    expect(initials("Nike")).toBe("NI");
  });

  it("handles empty input", () => {
    expect(initials("   ")).toBe("?");
  });
});
