import { describe, expect, it } from "vitest";

import { nextRunFrom, pickNextItem, shouldRetire } from "@/services/autolist";
import type { AutolistItem } from "@/types";

function item(id: string, over: Partial<AutolistItem> = {}): AutolistItem {
  return { id, caption: `post ${id}`, mediaAssetIds: [], ...over };
}

describe("nextRunFrom", () => {
  it("adds the cadence in days", () => {
    expect(nextRunFrom(new Date("2026-07-17T09:00:00.000Z"), 3)).toBe("2026-07-20T09:00:00.000Z");
  });
});

describe("shouldRetire", () => {
  it("never retires when the threshold is off", () => {
    expect(shouldRetire(item("a", { lastIntentScore: 10 }), null)).toBe(false);
  });

  it("retires a below-threshold score", () => {
    expect(shouldRetire(item("a", { lastIntentScore: 40 }), 45)).toBe(true);
  });

  it("keeps an at-or-above-threshold score", () => {
    expect(shouldRetire(item("a", { lastIntentScore: 45 }), 45)).toBe(false);
  });

  it("never retires an unpublished item on a guess", () => {
    expect(shouldRetire(item("a"), 45)).toBe(false);
  });

  it("treats an already-retired item as retired", () => {
    expect(shouldRetire(item("a", { retired: true }), null)).toBe(true);
  });
});

describe("pickNextItem", () => {
  it("returns the item at the cursor and advances", () => {
    const items = [item("a"), item("b"), item("c")];
    const pick = pickNextItem(items, 1, null);
    expect(pick?.item.id).toBe("b");
    expect(pick?.nextCursor).toBe(2);
  });

  it("wraps around past the end", () => {
    const pick = pickNextItem([item("a"), item("b")], 1, null);
    expect(pick?.item.id).toBe("b");
    expect(pick?.nextCursor).toBe(0);
  });

  it("skips items that should retire and reports them", () => {
    const items = [item("a", { lastIntentScore: 30 }), item("b", { lastIntentScore: 80 })];
    const pick = pickNextItem(items, 0, 45);
    expect(pick?.item.id).toBe("b");
    expect(pick?.retiredIds).toContain("a");
  });

  it("returns null when everything is below threshold", () => {
    const items = [item("a", { lastIntentScore: 10 }), item("b", { lastIntentScore: 20 })];
    expect(pickNextItem(items, 0, 45)).toBeNull();
  });

  it("returns null for an empty queue", () => {
    expect(pickNextItem([], 0, null)).toBeNull();
  });
});

describe("parseFeed", () => {
  it("extracts title, link and description from RSS items", async () => {
    const { parseFeed } = await import("@/lib/autolist-engine");
    const xml = `<rss><channel>
      <item><title>First post</title><link>https://blog.test/1</link><description>Hello &amp; welcome</description></item>
      <item><title><![CDATA[Second]]></title><link>https://blog.test/2</link></item>
    </channel></rss>`;
    const entries = parseFeed(xml);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      title: "First post",
      link: "https://blog.test/1",
      description: "Hello & welcome",
    });
    expect(entries[1]!.title).toBe("Second");
  });

  it("handles Atom entries with href links", async () => {
    const { parseFeed } = await import("@/lib/autolist-engine");
    const xml = `<feed><entry><title>Atom one</title><link href="https://a.test/x"/><summary>Sum</summary></entry></feed>`;
    const entries = parseFeed(xml);
    expect(entries[0]).toMatchObject({
      title: "Atom one",
      link: "https://a.test/x",
      description: "Sum",
    });
  });
});
