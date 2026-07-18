import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Meta's `X-Hub-Signature-256` header on a webhook POST.
 *
 * Meta signs the *raw* request body with HMAC-SHA256 keyed on the app secret and
 * sends it as `sha256=<hex>`. We recompute over the exact bytes received and
 * compare in constant time. This is the ONLY authentication on the public,
 * session-less webhook endpoint, so a missing, malformed or forged signature
 * must return false — the caller then rejects before reading the payload.
 *
 * Sibling of `parseSignedRequest` (which handles the *different* `signed_request`
 * format used by the deauthorize + data-deletion callbacks). Kept separate
 * because the two schemes share only a name: this one is a header over the body,
 * that one is a `{sig}.{payload}` string.
 */
export function verifyHubSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header || !header.startsWith("sha256=")) return false;

  const provided = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();

  // Length guard first: timingSafeEqual throws on a length mismatch, and a
  // truncated/odd-length hex header decodes to a short buffer.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
