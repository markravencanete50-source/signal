"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { markApproved, sendReminder, type ApprovalActionState } from "./actions";

/**
 * The two team-side controls on a pending-approval card: nudge the client, or
 * record the approval yourself. Each is its own form so their pending states and
 * errors stay independent.
 */
export function ApprovalActions({ postId }: { postId: string }) {
  const [reminder, remind] = useActionState<ApprovalActionState, FormData>(sendReminder, {});
  const [approval, approve] = useActionState<ApprovalActionState, FormData>(markApproved, {});
  const error = reminder.error ?? approval.error;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <form action={remind}>
          <input type="hidden" name="postId" value={postId} />
          <SubmitButton idle="Send reminder" busy="Sending…" done={reminder.ok} />
        </form>
        <form action={approve}>
          <input type="hidden" name="postId" value={postId} />
          <SubmitButton idle="Mark approved" busy="Saving…" done={approval.ok} />
        </form>
      </div>
      {reminder.ok && (
        <p className="text-success mt-2 text-[0.78rem] font-medium">Reminder sent.</p>
      )}
      {error && (
        <p role="alert" className="text-danger mt-2 text-[0.78rem] font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton({ idle, busy, done }: { idle: string; busy: string; done?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || done}
      className="border-border text-text-1 hover:bg-surface-2 rounded-[10px] border px-3.5 py-2 text-[0.82rem] font-semibold transition-colors disabled:opacity-50"
    >
      {pending ? busy : idle}
    </button>
  );
}
