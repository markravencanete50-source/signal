"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { addCompetitorAction, removeCompetitorAction, type CompetitorState } from "./actions";

/** The "+ Track profile" control — expands into a handle + platform form. */
export function AddCompetitor({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CompetitorState, FormData>(addCompetitorAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border text-text-1 hover:bg-surface-2 rounded-[10px] border px-4 py-[9px] text-[0.88rem] font-semibold"
      >
        + Track profile
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="brandId" value={brandId} />
      <select
        name="platform"
        defaultValue="ig"
        className="border-border bg-surface rounded-[10px] border px-2.5 py-2 text-[0.84rem]"
      >
        <option value="ig">Instagram</option>
        <option value="fb">Facebook</option>
      </select>
      <input
        name="handle"
        placeholder="@handle"
        className="border-border bg-surface w-[160px] rounded-[10px] border px-3 py-2 text-[0.84rem] outline-none"
      />
      <AddButton />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-text-2 hover:text-text-1 text-[0.82rem] font-semibold"
      >
        Cancel
      </button>
      {state.error && <span className="text-danger w-full text-[0.78rem]">{state.error}</span>}
    </form>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-accent-fg rounded-[10px] px-3.5 py-2 text-[0.84rem] font-semibold disabled:opacity-60"
    >
      {pending ? "Adding…" : "Track"}
    </button>
  );
}

export function RemoveCompetitor({ competitorId }: { competitorId: string }) {
  const [, action] = useActionState<CompetitorState, FormData>(removeCompetitorAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="competitorId" value={competitorId} />
      <RemoveButton />
    </form>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Stop tracking"
      className="text-text-2 hover:text-danger text-[0.8rem] font-semibold disabled:opacity-50"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}

/**
 * Client-loaded comparison insight. Fires the grounded AI call only when the view
 * is open, so the table itself renders instantly from stored snapshots.
 */
export function CompetitorInsight({ brandId }: { brandId: string }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "none">("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/ai/competitor-insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId }),
        });
        if (!alive) return;
        if (!res.ok) return setStatus("none");
        const data = await res.json();
        setInsight(data.insight);
        setStatus("done");
      } catch {
        if (alive) setStatus("none");
      }
    })();
    return () => {
      alive = false;
    };
  }, [brandId]);

  if (status === "none") return null;

  return (
    <p className="text-text-2 mt-3.5 text-[0.8rem] leading-relaxed">
      💡{" "}
      {status === "loading" ? <span className="opacity-60">Reading the comparison…</span> : insight}
    </p>
  );
}
