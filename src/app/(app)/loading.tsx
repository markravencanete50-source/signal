/**
 * Route-level loading fallback for every authed view.
 *
 * The App Router blocks a client navigation on the destination page's server
 * data fetch unless a `loading.tsx` provides a Suspense boundary. Without one,
 * switching features froze on the *old* view until the new page's query (e.g.
 * media's `listAssets`, plus the auth/context resolves) finished — which read as
 * "everything is slow to switch". This renders an instant skeleton inside the
 * shell (sidebar + topbar persist, only `<main>` swaps) so navigation feels
 * immediate; nested segments inherit it, so one file covers every view.
 *
 * Neutral by design — a title, a filter row and a card grid stand in for any
 * data view. `motion-safe:` honours `prefers-reduced-motion` (no shimmer when
 * the user has reduced motion set).
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">Loading…</span>

      {/* Title + subtitle */}
      <div className="mb-6 space-y-2">
        <div className="bg-surface-2 h-7 w-48 rounded-[8px]" />
        <div className="bg-surface-2 h-4 w-64 rounded-[6px]" />
      </div>

      {/* Filter / control row */}
      <div className="mb-4 flex gap-2">
        <div className="bg-surface-2 h-9 w-20 rounded-full" />
        <div className="bg-surface-2 h-9 w-24 rounded-full" />
        <div className="bg-surface-2 h-9 w-24 rounded-full" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-surface-2 border-border aspect-square rounded-[14px] border" />
        ))}
      </div>
    </div>
  );
}
