import "server-only";

import { cookies } from "next/headers";

import { adminAuth } from "../firebase-admin";

/**
 * Firebase session cookie lifecycle.
 *
 * Why session cookies rather than shipping the ID token around: ID tokens live
 * ~1 hour and are readable by JS, so they'd need refreshing and would be
 * exposed to XSS. A session cookie is httpOnly, lasts days, and can be revoked
 * server-side.
 */

export const SESSION_COOKIE = "__session";

/** 5 days. Firebase caps session cookies at 14; shorter limits the blast radius of theft. */
const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Exchange a freshly-minted Firebase ID token for a session cookie.
 *
 * `createSessionCookie` verifies the ID token's signature and expiry, so an
 * attacker cannot mint a session from a forged token. We additionally require
 * the sign-in to be recent: without that check, a stolen but still-valid ID
 * token could be upgraded into a long-lived session.
 */
export async function createSession(idToken: string): Promise<void> {
  const decoded = await adminAuth().verifyIdToken(idToken, true);

  const authAgeMs = Date.now() - decoded.auth_time * 1000;
  if (authAgeMs > 5 * 60 * 1000) {
    throw new Error("Sign-in is too old to start a session. Please sign in again.");
  }

  const sessionCookie = await adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    // Allow http on localhost; anything deployed is https.
    secure: process.env.NODE_ENV === "production",
    // "lax" still sends the cookie on top-level navigations, which the Meta
    // OAuth redirect back into the app depends on. "strict" would drop it and
    // bounce the user to /login mid-callback.
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Revoke every session for a user, server-side.
 *
 * Deleting the cookie only clears *this* browser. This invalidates the refresh
 * tokens behind all of them — needed when removing a member, since otherwise
 * their existing session keeps working until it expires.
 */
export async function revokeAllSessions(uid: string): Promise<void> {
  await adminAuth().revokeRefreshTokens(uid);
}
