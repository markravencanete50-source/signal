import type { AutolistItem } from "@/types";

/**
 * Autolist scheduling + selection — pure functions, unit-tested without
 * Firestore. The engine in `lib/autolist-engine.ts` does the I/O around these.
 */

/** The next run time, `cadenceDays` after `from`. */
export function nextRunFrom(from: Date, cadenceDays: number): string {
  return new Date(from.getTime() + cadenceDays * 86_400_000).toISOString();
}

/**
 * Decide whether an evergreen item should be retired rather than re-published.
 *
 * Retires only when there IS a score to judge and it fell below the threshold —
 * an item that hasn't been published yet (no score) is never retired on a guess.
 */
export function shouldRetire(item: AutolistItem, threshold: number | null): boolean {
  if (item.retired) return true;
  if (threshold === null) return false;
  return item.lastIntentScore !== undefined && item.lastIntentScore < threshold;
}

export interface Pick {
  item: AutolistItem;
  /** Cursor to store for next time (points just past the picked item). */
  nextCursor: number;
  /** Items newly retired while scanning past them, by id. */
  retiredIds: string[];
}

/**
 * Pick the next publishable evergreen item, starting at `cursor` and wrapping.
 * Skips (and collects) items that should retire. Returns null when every item is
 * retired/empty — the caller then pauses the autolist rather than looping.
 */
export function pickNextItem(
  items: AutolistItem[],
  cursor: number,
  threshold: number | null,
): Pick | null {
  if (items.length === 0) return null;

  const retiredIds: string[] = [];
  for (let step = 0; step < items.length; step++) {
    const i = (cursor + step) % items.length;
    const item = items[i]!;
    if (shouldRetire(item, threshold)) {
      if (!item.retired) retiredIds.push(item.id);
      continue;
    }
    return { item, nextCursor: (i + 1) % items.length, retiredIds };
  }
  return null; // nothing publishable
}
