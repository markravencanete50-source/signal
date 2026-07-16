import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Phase 0 shell.
 *
 * Deliberately minimal: its job is to prove the foundation works — fonts load,
 * every semantic token resolves, and one class on <html> repaints the whole
 * palette. Phase 1 replaces this with the marketing landing page and moves the
 * authed views under `(app)`.
 */
export default function Home() {
  return (
    <div className="bg-bg min-h-screen">
      <header className="border-border bg-surface sticky top-0 z-40 flex h-[60px] items-center gap-3 border-b px-6">
        <div className="flex items-center gap-[10px]">
          <div className="bg-accent grid size-[30px] place-items-center rounded-[9px]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent-fg)"
              strokeWidth="2.4"
              strokeLinecap="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M4 16l4-7 4 4 4-9 4 6" />
            </svg>
          </div>
          <span className="font-display text-[1.15rem] font-bold tracking-[-0.02em]">Signal</span>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-7 py-7">
        <div className="mb-[22px]">
          <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Phase 0 — Foundation</h1>
          <p className="text-text-2 mt-[3px] text-[0.88rem]">
            Tokens, theming and tooling. Toggle the theme to verify every surface flips.
          </p>
        </div>

        <section className="mb-[14px] grid grid-cols-2 gap-[14px] md:grid-cols-4">
          {[
            { label: "Followers", value: "12,840", delta: "▲ 2.1%", up: true },
            { label: "Reach · 7 days", value: "48.2K", delta: "▼ 8.4%", up: false },
            { label: "Intent score · avg", value: "71", delta: "▲ 5", up: true },
            { label: "Niche coherence", value: "84", delta: "▲ 3", up: true },
          ].map((m) => (
            <div key={m.label} className="border-border bg-surface rounded-2xl border p-5">
              <span className="text-text-2 mb-2 block text-[0.76rem] font-medium">{m.label}</span>
              <span className="font-display text-[1.75rem] leading-none font-bold tracking-[-0.03em]">
                {m.value}
              </span>
              <span
                className={`mt-1.5 inline-flex items-center gap-[3px] text-[0.76rem] font-semibold ${
                  m.up ? "text-success" : "text-danger"
                }`}
              >
                {m.delta}
              </span>
            </div>
          ))}
        </section>

        <section className="border-border bg-surface rounded-2xl border p-5">
          <h3 className="mb-3 text-[0.95rem] font-semibold">Token check</h3>
          <div className="flex flex-wrap gap-2">
            {[
              ["accent", "bg-accent text-accent-fg"],
              ["accent-soft", "bg-accent-soft text-accent"],
              ["success-soft", "bg-success-soft text-success"],
              ["warning-soft", "bg-warning-soft text-warning"],
              ["danger-soft", "bg-danger-soft text-danger"],
              ["surface-2", "bg-surface-2 text-text-2"],
            ].map(([name, cls]) => (
              <span
                key={name}
                className={`inline-flex items-center rounded-full px-[10px] py-1 text-[0.72rem] font-semibold ${cls}`}
              >
                {name}
              </span>
            ))}
          </div>
          {/* Class names are written out in full — Tailwind scans source
              statically, so an interpolated `bg-${c}` would never be generated. */}
          <div className="mt-4 flex gap-2">
            {[
              ["chart-1", "bg-chart-1"],
              ["chart-2", "bg-chart-2"],
              ["chart-3", "bg-chart-3"],
              ["chart-4", "bg-chart-4"],
            ].map(([name, cls]) => (
              <div key={name} className="flex-1">
                <div className={`h-10 rounded-lg ${cls}`} />
                <span className="text-text-2 mt-1.5 block text-[0.72rem]">{name}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
