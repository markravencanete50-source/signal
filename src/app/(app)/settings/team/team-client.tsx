"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { ROLE_LABEL, type Role } from "@/types";

import {
  cancelInvite,
  changeRole,
  inviteMember,
  removeTeamMember,
  type TeamState,
} from "./actions";

/** Invite-by-email form. */
export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [state, formAction] = useActionState<TeamState, FormData>(inviteMember, {});

  return (
    <div className="border-border bg-surface mb-6 rounded-2xl border p-5">
      <h3 className="mb-1 text-[0.95rem] font-semibold">Invite a teammate</h3>
      <p className="text-text-2 mb-3 text-[0.8rem]">
        They&rsquo;ll get an email link. Clients see only what they need to review and approve.
      </p>

      <form action={formAction} className="flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="workspaceId" value={workspaceId} />

        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-[0.78rem] font-semibold">Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="teammate@agency.com"
            className="border-border bg-surface placeholder:text-text-2 rounded-[10px] border px-3 py-2.5 text-[0.86rem] outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.78rem] font-semibold">Role</span>
          <select
            name="role"
            defaultValue="editor"
            className="border-border bg-surface rounded-[10px] border px-3 py-2.5 text-[0.86rem] outline-none"
          >
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="client">Client</option>
          </select>
        </label>

        <InviteSubmit />
      </form>

      {state.error && (
        <p role="alert" className="text-danger mt-2.5 text-[0.8rem] font-medium">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-success mt-2.5 text-[0.8rem] font-medium">{state.success}</p>
      )}
    </div>
  );
}

function InviteSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send invite"}
    </Button>
  );
}

/**
 * Per-row actions: role dropdown + remove for members, cancel for invites.
 *
 * One component for both because the preview keeps team management to a single
 * compact row; `inviteId` vs `uid` decides which controls render.
 */
export function MemberActions({
  workspaceId,
  uid,
  currentRole,
  inviteId,
}: {
  workspaceId: string;
  uid?: string;
  currentRole?: Role;
  inviteId?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (inviteId) {
    return (
      <form action={cancelInvite}>
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="inviteId" value={inviteId} />
        <button
          type="submit"
          className="text-text-2 hover:text-danger text-[0.78rem] font-semibold"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <form action={changeRole}>
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="uid" value={uid} />
        <select
          name="role"
          defaultValue={currentRole}
          // Submitting on change keeps the row to a single control, matching the
          // preview's density — no separate save button.
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="border-border bg-surface rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-medium outline-none"
          aria-label="Change role"
        >
          <option value="admin">{ROLE_LABEL.admin}</option>
          <option value="editor">{ROLE_LABEL.editor}</option>
          <option value="client">{ROLE_LABEL.client}</option>
        </select>
      </form>

      {confirming ? (
        <form action={removeTeamMember} className="flex items-center gap-1.5">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="uid" value={uid} />
          <button
            type="submit"
            className="bg-danger rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-white"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-text-2 text-[0.76rem] font-medium"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-text-2 hover:text-danger text-[0.78rem] font-semibold"
          aria-label="Remove member"
        >
          Remove
        </button>
      )}
    </div>
  );
}
