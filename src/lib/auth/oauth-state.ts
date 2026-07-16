import "server-only";

import { cookies } from "next/headers";
import { createHmac, randomBytes } from "node:crypto";

import { env } from "../env";
import { safeEqual } from "../crypto";

/**
 * OAuth `state` — CSRF protection for the Meta connect flow.
 *
 * Without this, an attacker can send a victim a crafted callback URL carrying
 * the attacker's `code`, and the victim's browser would silently bind the
 * attacker's Facebook Page to the victim's brand (or vice versa: bind the
 * victim's Page into the attacker's workspace). The state must therefore be
 * unguessable, bound to this browser, and integrity-protected.
 *
 * Design: the payload (brandId, platform, nonce) is HMAC-signed and sent to
 * Meta, while the nonce alone is also stored in an httpOnly cookie. The
 * callback requires both to agree, so a state minted for someone else's session
 * is rejected even though it is validly signed.
 */

const STATE_COOKIE = "signal_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;

export interface OAuthState {
  brandId: string;
  platform: "fb" | "ig";
  nonce: string;
}

function sign(payload: string): string {
  // CRON_SECRET is reused as an HMAC key here purely as an app-level secret; it
  // never leaves the server and is unrelated to token encryption.
  return createHmac("sha256", env().CRON_SECRET).update(payload).digest("base64url");
}

/**
 * Mint a signed state and pin its nonce to this browser.
 *
 * Returns the opaque string to hand to `adapter.buildAuthUrl()`.
 */
export async function createOAuthState(brandId: string, platform: "fb" | "ig"): Promise<string> {
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ brandId, platform, nonce })).toString("base64url");
  const state = `${payload}.${sign(payload)}`;

  const store = await cookies();
  store.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Meta redirects back via a top-level GET navigation. "strict" would omit
    // the cookie on that cross-site navigation and every connect would fail.
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  return state;
}

/**
 * Verify a returned state. Returns null on any failure — the caller must treat
 * null as "abort the connect", never as "continue without a brand".
 */
export async function consumeOAuthState(state: string | null): Promise<OAuthState | null> {
  if (!state) return null;

  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  // Constant-time: a fast-fail comparison leaks the signature byte by byte.
  if (!safeEqual(signature, sign(payload))) return null;

  let parsed: OAuthState;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  } catch {
    return null;
  }

  const store = await cookies();
  const cookieNonce = store.get(STATE_COOKIE)?.value;

  // The signature proves *we* minted it; the cookie proves it was minted for
  // THIS browser. Both are required — a valid signature alone is replayable.
  if (!cookieNonce || !safeEqual(cookieNonce, parsed.nonce)) return null;

  // Single-use.
  store.delete(STATE_COOKIE);

  return parsed;
}
