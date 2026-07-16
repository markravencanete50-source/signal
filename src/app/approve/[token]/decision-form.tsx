"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { submitDecision, type DecisionState } from "./actions";

/**
 * The confirm-decision control on the public approval page. The email link
 * pre-selects approve or reject; the client can flip it, add a note, and confirm.
 */
export function DecisionForm({
  token,
  initialDecision,
}: {
  token: string;
  initialDecision: "approved" | "rejected";
}) {
  const [state, formAction] = useActionState<DecisionState, FormData>(submitDecision, {});
  const [decision, setDecision] = useState<"approved" | "rejected">(initialDecision);

  if (state.done) {
    return (
      <div className="border-border bg-surface mt-6 rounded-2xl border p-6 text-center">
        <p className="text-[1rem] font-semibold">
          {state.done === "approved" ? "✓ Approved" : "Changes requested"}
        </p>
        <p className="text-text-2 mt-1 text-[0.85rem]">
          {state.done === "approved"
            ? "Thanks — the team has been notified and the post will go out as scheduled."
            : "Thanks — the team has been notified and will revise the post."}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decision" value={decision} />

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setDecision("approved")}
          className={`flex-1 rounded-[10px] border-[1.5px] px-4 py-2.5 text-[0.9rem] font-semibold transition-colors ${
            decision === "approved"
              ? "border-success bg-success-soft text-success"
              : "border-border text-text-2"
          }`}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setDecision("rejected")}
          className={`flex-1 rounded-[10px] border-[1.5px] px-4 py-2.5 text-[0.9rem] font-semibold transition-colors ${
            decision === "rejected"
              ? "border-danger bg-danger-soft text-danger"
              : "border-border text-text-2"
          }`}
        >
          Request changes
        </button>
      </div>

      <textarea
        name="note"
        maxLength={500}
        placeholder={
          decision === "approved" ? "Add a note (optional)" : "What should change? (optional)"
        }
        className="border-border bg-surface min-h-[70px] w-full resize-y rounded-xl border p-3 text-[0.88rem] outline-none"
      />

      {state.error && (
        <p role="alert" className="text-danger mt-2 text-[0.82rem] font-medium">
          {state.error}
        </p>
      )}

      <ConfirmButton decision={decision} />
    </form>
  );
}

function ConfirmButton({ decision }: { decision: "approved" | "rejected" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-accent-fg mt-3 w-full rounded-[10px] px-4 py-2.5 text-[0.9rem] font-semibold disabled:opacity-60"
    >
      {pending
        ? "Submitting…"
        : decision === "approved"
          ? "Confirm approval"
          : "Confirm & request changes"}
    </button>
  );
}
