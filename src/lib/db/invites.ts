import "server-only";

import type { Role } from "@/types";

import { generatePublicToken } from "../crypto";
import { adminDb } from "../firebase-admin";

/**
 * Workspace invites (magic link).
 *
 * Not in the spec's data model, but member invites need somewhere to live —
 * see DECISIONS #012.
 *
 * The token is a **bearer credential**: whoever holds the link gets the role.
 * So it's 32 crypto-random bytes, single-use, expiring, and `invites/*` denies
 * all client access in firestore.rules — a client-readable invite collection
 * would let any member enumerate tokens and self-promote to owner.
 */

const COLLECTION = "invites";
const EXPIRY_DAYS = 7;

export interface Invite {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Role;
  token: string;
  invitedBy: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
}

export async function createInvite(params: {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Role;
  invitedBy: string;
  invitedByName: string;
}): Promise<Invite> {
  const ref = adminDb().collection(COLLECTION).doc();
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + EXPIRY_DAYS);

  const invite: Omit<Invite, "id"> = {
    workspaceId: params.workspaceId,
    workspaceName: params.workspaceName,
    // Normalised so "Lee@X.com" and "lee@x.com" can't produce two live invites,
    // and so the accept-time identity check compares like with like.
    email: params.email.trim().toLowerCase(),
    role: params.role,
    token: generatePublicToken(),
    invitedBy: params.invitedBy,
    invitedByName: params.invitedByName,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  await ref.set(invite);
  return { id: ref.id, ...invite };
}

export async function findInviteByToken(token: string): Promise<Invite | null> {
  const snap = await adminDb().collection(COLLECTION).where("token", "==", token).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...doc.data() } as Invite;
}

export type InviteRejection = "not_found" | "expired" | "already_accepted" | "wrong_email";

/**
 * Validate an invite for a specific signed-in identity.
 *
 * The `wrong_email` check is what stops an invite link forwarded (or leaked)
 * to a third party granting them access: the token alone is not enough, the
 * accepting account must own the invited address.
 */
export function validateInvite(
  invite: Invite | null,
  userEmail: string,
): { ok: true; invite: Invite } | { ok: false; reason: InviteRejection } {
  if (!invite) return { ok: false, reason: "not_found" };
  if (invite.acceptedAt) return { ok: false, reason: "already_accepted" };
  if (new Date(invite.expiresAt) < new Date()) return { ok: false, reason: "expired" };
  if (invite.email !== userEmail.trim().toLowerCase()) return { ok: false, reason: "wrong_email" };
  return { ok: true, invite };
}

/** Mark consumed. Single-use: a second click must not re-add a removed member. */
export async function markInviteAccepted(id: string, uid: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).update({
    acceptedAt: new Date().toISOString(),
    acceptedBy: uid,
  });
}

export async function listPendingInvites(workspaceId: string): Promise<Invite[]> {
  const snap = await adminDb().collection(COLLECTION).where("workspaceId", "==", workspaceId).get();

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Invite)
    .filter((i) => !i.acceptedAt && new Date(i.expiresAt) > new Date());
}

export async function revokeInvite(id: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).delete();
}
