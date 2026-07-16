import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Parse and verify a Meta `signed_request` (deauthorize + data-deletion
 * callbacks send one). Format is `{signature}.{payload}`, both base64url; the
 * signature is HMAC-SHA256 of the payload string, keyed with the app secret.
 *
 * Returns the decoded payload only when the signature verifies with a
 * constant-time compare — a forged or tampered request returns null, so a caller
 * can never act on unauthenticated input. This is the security boundary for
 * these public, session-less endpoints.
 */

export interface SignedRequestPayload {
  /** App-scoped id of the Meta user the request concerns. */
  user_id: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

export function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): SignedRequestPayload | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts as [string, string];

  let expected: Buffer;
  let provided: Buffer;
  try {
    provided = base64UrlToBuffer(encodedSig);
    expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  } catch {
    return null;
  }

  // Constant-time compare; length guard first (timingSafeEqual throws on mismatch).
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const json = base64UrlToBuffer(encodedPayload).toString("utf8");
    const payload = JSON.parse(json) as SignedRequestPayload;
    // Meta only signs with HMAC-SHA256; reject anything claiming otherwise.
    if (payload.algorithm && payload.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    if (typeof payload.user_id !== "string" || payload.user_id.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

function base64UrlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}
