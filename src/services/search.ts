/**
 * Global-search ranking — pure, so it unit-tests without Firestore and the
 * gatherer in `lib/search.ts` and the API share one relevance definition.
 *
 * There's no external search service (the stack is locked): an agency's dataset
 * is small enough to fetch a bounded set and rank in memory. Matching is
 * case-insensitive; a prefix beats a word-start beats a substring, and a hit in
 * the title outranks the same hit in a subtitle or keyword.
 */

export type SearchType = "post" | "media" | "report" | "brand";

export interface SearchResult {
  type: SearchType;
  id: string;
  title: string;
  subtitle?: string;
  /** Brand to switch to before navigating (post/media/brand results). */
  brandId?: string;
  href: string;
}

export interface Searchable extends SearchResult {
  /** Extra text to match beyond title/subtitle — tags, full caption, etc. */
  keywords?: string[];
}

/** 3 = prefix, 2 = a word starts with the query, 1 = substring, 0 = no match. */
export function scoreText(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q || !t) return 0;
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s._/-]+/).some((w) => w.startsWith(q))) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

const FIELD_WEIGHT = { title: 3, subtitle: 1.5, keyword: 1 } as const;

/** Best weighted score for one item across its title, subtitle and keywords. */
export function scoreItem(query: string, item: Searchable): number {
  let best = scoreText(query, item.title) * FIELD_WEIGHT.title;
  if (item.subtitle) best = Math.max(best, scoreText(query, item.subtitle) * FIELD_WEIGHT.subtitle);
  for (const kw of item.keywords ?? []) {
    best = Math.max(best, scoreText(query, kw) * FIELD_WEIGHT.keyword);
  }
  return best;
}

/**
 * Rank items against the query, dropping non-matches. Ties break toward the
 * shorter title (a more specific match), then alphabetically for stability.
 */
export function rankResults(query: string, items: Searchable[], limit = 8): SearchResult[] {
  const scored = items
    .map((item) => ({ item, score: scoreItem(query, item) }))
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.title.length - b.item.title.length ||
        a.item.title.localeCompare(b.item.title),
    )
    .slice(0, limit);

  // Strip the internal `keywords` field from the returned results.
  return scored.map(({ item }) => ({
    type: item.type,
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    brandId: item.brandId,
    href: item.href,
  }));
}
