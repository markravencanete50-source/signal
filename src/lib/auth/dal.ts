import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { adminDb } from "../firebase-admin";
import { adminAuth } from "../firebase-admin";
import { ADMIN_ROLES, WRITER_ROLES, type Member, type Role, type User } from "@/types";

import { SESSION_COOKIE } from "./session";

/**
 * Data Access Layer — the real authorisation boundary.
 *
 * `proxy.ts` only checks whether a session cookie *exists*; it proves nothing.
 * Every server component, server action and route handler that touches tenant
 * data must call through here. The Admin SDK bypasses Firestore rules, so if
 * these checks are skipped there is nothing else standing between a request and
 * another tenant's data.
 *
 * All lookups are wrapped in React `cache()`, which dedupes per render pass —
 * so a layout, a page and three components asking "who is this?" cost one
 * verification, not five.
 */

export interface Session {
  uid: string;
  email: string;
}

/**
 * Verify the session cookie. Returns null when absent or invalid rather than
 * throwing, so callers can choose between redirecting and rendering a public view.
 *
 * `checkRevoked: true` costs a lookup but means removing a member or revoking
 * sessions takes effect immediately instead of whenever the cookie expires.
 */
export const verifySession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(token, true);
    return { uid: decoded.uid, email: decoded.email ?? "" };
  } catch {
    // Expired, revoked, malformed, or signed by another project. All mean
    // "not authenticated" — never surface the reason to the caller.
    return null;
  }
});

/** Session or bust. Use in any authed server component. */
export const requireSession = cache(async (): Promise<Session> => {
  const session = await verifySession();
  if (!session) redirect("/login");
  return session;
});

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await verifySession();
  if (!session) return null;

  const snap = await adminDb().doc(`users/${session.uid}`).get();
  if (!snap.exists) return null;

  return { uid: snap.id, ...snap.data() } as User;
});

/**
 * The caller's role in a workspace, or null if they are not a member.
 *
 * This single lookup is what every other guard is built on — it is the
 * server-side mirror of `role(wsId)` in firestore.rules.
 */
export const getRole = cache(async (workspaceId: string): Promise<Role | null> => {
  const session = await verifySession();
  if (!session) return null;

  const snap = await adminDb().doc(`workspaces/${workspaceId}/members/${session.uid}`).get();
  if (!snap.exists) return null;

  return (snap.data() as Member).role;
});

/**
 * Thrown when an authenticated user lacks the required role.
 *
 * Distinct from "not authenticated": the fix is different (ask an admin vs sign
 * in), and conflating them sends signed-in users to a pointless login page.
 * Next's `forbidden()` would be the natural fit but is still experimental
 * behind `authInterrupts`, so this stays on stable APIs.
 */
export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Assert membership of a workspace with one of `roles`.
 *
 * Returns the caller's session and role so callers don't re-query. Redirects
 * when unauthenticated; throws ForbiddenError when authenticated but under-privileged.
 */
export async function requireRole(
  workspaceId: string,
  roles: readonly Role[],
): Promise<{ session: Session; role: Role }> {
  const session = await requireSession();
  const role = await getRole(workspaceId);

  if (!role) {
    // Not a member. Deliberately indistinguishable from "workspace does not
    // exist" — otherwise this endpoint enumerates valid workspace ids.
    throw new ForbiddenError("You don't have access to this workspace.");
  }

  if (!roles.includes(role)) {
    throw new ForbiddenError(`This action requires ${roles.join(" or ")} access. You are ${role}.`);
  }

  return { session, role };
}

/** Any member, including read-only clients. */
export async function requireMember(workspaceId: string) {
  return requireRole(workspaceId, ["owner", "admin", "editor", "client"]);
}

/** Can create/modify content. Excludes `client`. */
export async function requireWriter(workspaceId: string) {
  return requireRole(workspaceId, WRITER_ROLES);
}

/** Can manage members, brands and connections. */
export async function requireAdmin(workspaceId: string) {
  return requireRole(workspaceId, ADMIN_ROLES);
}

/**
 * Resolve the workspace a brand belongs to, then assert access.
 *
 * Most routes are addressed by brandId, not workspaceId. Trusting a
 * client-supplied workspaceId alongside a brandId would let a caller pair their
 * own workspace with someone else's brand and walk straight through the guard,
 * so the workspace is always derived from the brand itself.
 */
export async function requireBrandAccess(
  brandId: string,
  roles: readonly Role[] = ["owner", "admin", "editor", "client"],
): Promise<{ session: Session; role: Role; workspaceId: string }> {
  const snap = await adminDb().doc(`brands/${brandId}`).get();
  if (!snap.exists) throw new ForbiddenError("Brand not found.");

  const workspaceId = snap.data()?.workspaceId as string | undefined;
  if (!workspaceId) throw new ForbiddenError("Brand is not attached to a workspace.");

  const { session, role } = await requireRole(workspaceId, roles);
  return { session, role, workspaceId };
}
