"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { PlatformChange } from "@/types/metrics";

import { addPlatformChange, removePlatformChange, type PulseState } from "./actions";

/**
 * Platform-changes feed editor. Members see the timeline; admins can add and
 * remove notes. The feed is manually curated — it's "what changed on the
 * platforms" context that isn't synced from anywhere.
 */
export function PlatformChangesEditor({
  workspaceId,
  changes,
  canEdit,
}: {
  workspaceId: string;
  changes: PlatformChange[];
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<PulseState, FormData>(addPlatformChange, {});
  const [adding, setAdding] = useState(false);

  return (
    <>
      {changes.length === 0 && !adding && (
        <p className="text-text-2 text-[0.82rem] leading-relaxed">
          No notes yet. Track known IG/FB algorithm changes here so a reach shift has context.
        </p>
      )}

      <div className="relative pl-[22px]">
        {changes.length > 0 && (
          <div className="bg-border absolute top-1.5 bottom-1.5 left-1.5 w-0.5" />
        )}
        {changes.map((c) => (
          <div key={c.id} className="group relative pb-[18px] last:pb-0">
            <span className="border-accent bg-surface absolute top-1 -left-[20px] size-2.5 rounded-full border-[2.5px]" />
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <time className="text-text-2 text-[0.7rem] font-semibold tracking-[0.05em] uppercase">
                  {c.period}
                </time>
                <p className="mt-1 text-[0.85rem] leading-relaxed">{c.body}</p>
              </div>
              {canEdit && (
                <form action={removePlatformChange}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    className="text-text-2 hover:text-danger text-[0.72rem] font-semibold opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove note"
                  >
                    Remove
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>

      {canEdit &&
        (adding ? (
          <form
            action={formAction}
            className="mt-3 flex flex-col gap-2"
            onSubmit={() => setAdding(false)}
          >
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input
              name="period"
              required
              maxLength={40}
              placeholder="e.g. Jun 2026"
              className="border-border bg-surface rounded-lg border px-2.5 py-1.5 text-[0.82rem] outline-none"
            />
            <textarea
              name="body"
              required
              maxLength={400}
              placeholder="What changed on the platform?"
              className="border-border bg-surface min-h-[60px] resize-y rounded-lg border px-2.5 py-1.5 text-[0.82rem] outline-none"
            />
            {state.error && <p className="text-danger text-[0.76rem] font-medium">{state.error}</p>}
            <div className="flex gap-2">
              <AddButton />
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-accent mt-3 text-[0.8rem] font-semibold hover:underline"
          >
            + Add a note
          </button>
        ))}
    </>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add"}
    </Button>
  );
}
