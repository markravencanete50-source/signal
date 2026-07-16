/**
 * Minimal class-name joiner.
 *
 * Deliberately not clsx/tailwind-merge: the build spec says no component
 * libraries and the UI kit is hand-built, so a 6-line helper beats two
 * dependencies. Later-wins conflict resolution isn't needed because component
 * variants here are exclusive, not layered.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
