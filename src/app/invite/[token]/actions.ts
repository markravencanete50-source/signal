"use server";

import { redirect } from "next/navigation";

import { getCurrentUser, requireSession } from "@/lib/auth/dal";
import { findInviteByToken, markInviteAccepted, validateInvite } from "@/lib/db/invites";
import { getMember } from "@/lib/db/workspaces";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Accept an invite.
 *
 * Re-validates everything the page checked — the page render and this action are
 * separate requests, and a server action is a public endpoint. The token could
 * have been revoked, expired, or already accepted in between, and the caller
 * could POST a different token than the page showed.
 *
 * Membership add + invite consume happen in one batch so a re-click or crash
 * can't add a member without burning the single-use invite (or vice versa).
 */
export async function acceptInvite(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const session = await requireSession();

  const invite = await findInviteByToken(token);
  const check = validateInvite(invite, session.email);

  if (!check.ok) {
    redirect(`/invite/${token}`);
  }

  const { invite: valid } = check;

  // Idempotent: a double-submit shouldn't error, just land in the app.
  const existing = await getMember(valid.workspaceId, session.uid);
  if (existing) {
    await markInviteAccepted(valid.id, session.uid);
    redirect("/dashboard");
  }

  const user = await getCurrentUser();

  const batch = adminDb().batch();
  batch.set(adminDb().doc(`workspaces/${valid.workspaceId}/members/${session.uid}`), {
    uid: session.uid,
    role: valid.role,
    joinedAt: new Date().toISOString(),
  });
  batch.update(adminDb().doc(`invites/${valid.id}`), {
    acceptedAt: new Date().toISOString(),
    acceptedBy: session.uid,
  });
  // Make the joined workspace their default if they had none.
  if (user && !user.defaultWorkspaceId) {
    batch.set(
      adminDb().doc(`users/${session.uid}`),
      { defaultWorkspaceId: valid.workspaceId },
      { merge: true },
    );
  }

  await batch.commit();

  redirect("/dashboard");
}
