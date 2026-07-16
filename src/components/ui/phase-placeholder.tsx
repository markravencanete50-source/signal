/**
 * Placeholder for views that arrive in a later phase.
 *
 * Exists so the shell's navigation is fully wired and walkable now — every nav
 * item lands on a real, themed page rather than a 404 — without faking data the
 * engines behind it don't produce yet. Each stub names the phase that fills it,
 * so the nav doubles as a build map.
 */
export function PhasePlaceholder({
  title,
  subtitle,
  phase,
  description,
}: {
  title: string;
  subtitle: string;
  phase: string;
  description: string;
}) {
  return (
    <>
      <div className="mb-[22px]">
        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">{title}</h1>
        <p className="text-text-2 mt-[3px] text-[0.88rem]">{subtitle}</p>
      </div>

      <div className="border-border grid min-h-[280px] place-items-center rounded-2xl border-[1.5px] border-dashed p-8 text-center">
        <div className="max-w-[420px]">
          <span className="bg-accent-soft text-accent inline-block rounded-full px-3 py-1 text-[0.7rem] font-bold tracking-[0.06em] uppercase">
            {phase}
          </span>
          <p className="text-text-2 mt-3 text-[0.9rem] leading-relaxed">{description}</p>
        </div>
      </div>
    </>
  );
}
