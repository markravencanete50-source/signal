"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { InviteEmail } from "@/emails/invite";
import { getCurrentUser, requireAdmin } from "@/lib/auth/dal";
import { recordAudit } from "@/lib/db/audit";
import { createInvite, listPendingInvites, revokeInvite } from "@/lib/db/invites";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/resend";
import {
  getUserLabel,
  getWorkspace,
  listTeamMembers,
  removeMember,
  updateMemberRole,
} from "@/lib/db/workspaces";
import { canAddSeat, planFor } from "@/services/plans";

/** The current user as an audit actor. */
async function actor(): Promise<{ actorId: string; actorName: string }> {
  const user = await getCurrentUser();
  return { actorId: user?.uid ?? "unknown", actorName: user?.name ?? user?.email ?? "A teammate" };
}
import { revokeAllSessions } from "@/lib/auth/session";
import { adminAuth } from "@/lib/firebase-admin";

const inviteSchema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().email("That doesn't look like a valid email address."),
  role: z.enum(["admin", "editor", "client"]),
});

export type TeamState = { error?: string; success?: string };

/**
 * Invite a member by email (magic link via Resend).
 *
 * `owner` is deliberately not an invitable role — there is exactly one owner,
 * set at workspace creation. Allowing an invite to mint a second owner would
 * route around the members rule that stops anyone rewriting their own role.
 */
export async function inviteMember(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const parsed = inviteSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const { workspaceId, email, role } = parsed.data;

  try {
    await requireAdmin(workspaceId);
    const [inviter, workspace, members, pending] = await Promise.all([
      getCurrentUser(),
      getWorkspace(workspaceId),
      listTeamMembers(workspaceId),
      listPendingInvites(workspaceId),
    ]);
    if (!workspace) return { error: "Workspace not found." };

    // Plan gate: a seat is a current member OR a live invite. Enforced here, not
    // just hidden in the UI.
    const usedSeats = members.length + pending.length;
    if (!canAddSeat(workspace.plan, usedSeats)) {
      return {
        error: `Your ${planFor(workspace.plan).name} plan includes ${planFor(workspace.plan).maxSeats} seats. Upgrade to invite more people.`,
      };
    }

    const invite = await createInvite({
      workspaceId,
      workspaceName: workspace.name,
      email,
      role,
      invitedBy: inviter?.uid ?? "",
      invitedByName: inviter?.name ?? "A teammate",
    });

    await sendEmail({
      to: email,
      subject: `${invite.invitedByName} invited you to ${workspace.name} on Signal`,
      react: InviteEmail({
        inviterName: invite.invitedByName,
        workspaceName: workspace.name,
        role,
        acceptUrl: `${env().APP_URL}/invite/${invite.token}`,
      }),
    });

    await recordAudit({
      workspaceId,
      ...(await actor()),
      action: "member.invited",
      target: email,
      metadata: { role },
    }).catch(() => {});

    revalidatePath("/settings/team");
    return { success: `Invitation sent to ${email}.` };
  } catch (err) {
    // The invite row is written before the email is sent, so a Resend failure
    // leaves a live invite with no link delivered. Surfaced honestly rather
    // than reported as success — the admin can revoke and retry.
    const message = err instanceof Error ? err.message : "Could not send the invitation.";
    return { error: message };
  }
}

export async function changeRole(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const uid = String(formData.get("uid") ?? "");
  const role = String(formData.get("role") ?? "");

  const parsed = z.enum(["admin", "editor", "client"]).safeParse(role);
  if (!parsed.success) throw new Error("Invalid role.");

  const { session } = await requireAdmin(workspaceId);

  // Mirrors the Firestore rule: nobody rewrites their own role, or an admin
  // could demote themselves into an unadministrable workspace.
  if (uid === session.uid) throw new Error("You can't change your own role.");

  const workspace = await getWorkspace(workspaceId);
  if (workspace?.ownerId === uid) throw new Error("The workspace owner's role can't be changed.");

  await updateMemberRole(workspaceId, uid, parsed.data);
  await recordAudit({
    workspaceId,
    ...(await actor()),
    action: "member.role_changed",
    target: await getUserLabel(uid),
    metadata: { role: parsed.data },
  }).catch(() => {});
  revalidatePath("/settings/team");
}

/**
 * Remove a member.
 *
 * Revokes their refresh tokens too: deleting the member doc stops future
 * authorisation, but their existing session cookie stays valid until it expires
 * (up to 5 days), and `verifySession` would keep accepting it. Revoking is what
 * makes removal immediate.
 */
export async function removeTeamMember(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const uid = String(formData.get("uid") ?? "");

  const { session } = await requireAdmin(workspaceId);
  if (uid === session.uid) throw new Error("You can't remove yourself.");

  const workspace = await getWorkspace(workspaceId);
  if (workspace?.ownerId === uid) throw new Error("The workspace owner can't be removed.");

  const label = await getUserLabel(uid);
  await removeMember(workspaceId, uid);
  await recordAudit({
    workspaceId,
    ...(await actor()),
    action: "member.removed",
    target: label,
  }).catch(() => {});

  try {
    await revokeAllSessions(uid);
  } catch {
    // User record may already be gone; removal itself has succeeded.
  }

  revalidatePath("/settings/team");
}

export async function cancelInvite(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");

  await requireAdmin(workspaceId);
  await revokeInvite(inviteId);

  revalidatePath("/settings/team");
}

/** Look up whether an invited email already has an account, for nicer copy. */
export async function userExists(email: string): Promise<boolean> {
  try {
    await adminAuth().getUserByEmail(email);
    return true;
  } catch {
    return false;
  }
}
