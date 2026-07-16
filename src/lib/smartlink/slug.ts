/**
 * SmartLink slug helpers — pure, so they unit-test without Firestore.
 *
 * A slug is the public path segment (`/s/{slug}`), so it must be URL-safe and
 * stable: lowercase, alphanumeric and single hyphens only, no leading/trailing
 * or doubled hyphens.
 */

// Combining diacritical marks (U+0300–U+036F), stripped after NFKD normalisation.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Pick a slug not already taken. Appends `-2`, `-3`, … until free. `taken` is
 * the set of existing slugs the caller has looked up.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base) || "brand";
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Initials for the avatar bubble, at most two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}
