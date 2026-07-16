import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "./env";

/**
 * AES-256-GCM encryption for platform access tokens at rest, plus the
 * crypto-random token helpers used for public report and approval links.
 *
 * GCM (not CBC) because it is authenticated: tampering with the ciphertext
 * fails decryption loudly instead of yielding garbage plaintext. A Meta token
 * that silently decrypts to junk would surface as a confusing Graph API error
 * hours later.
 *
 * Wire format: `<iv>.<authTag>.<ciphertext>`, all base64url. The IV and tag are
 * not secret — they must be stored alongside the ciphertext to decrypt at all.
 */

const ALGORITHM = "aes-256-gcm";
/** 96 bits is the GCM-recommended IV length; other sizes force extra derivation. */
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function key(): Buffer {
  // env() already enforces exactly 64 hex chars, so this is always 32 bytes.
  return Buffer.from(env().TOKEN_ENCRYPTION_KEY, "hex");
}

/**
 * Encrypt a platform access token for storage in `connections.accessTokenEnc`.
 *
 * A fresh random IV per call is mandatory: reusing an IV under the same key in
 * GCM leaks plaintext and destroys authentication. Never derive it from
 * anything deterministic like a connection id.
 */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a stored token. Throws if the payload was tampered with, truncated,
 * or encrypted under a different TOKEN_ENCRYPTION_KEY (i.e. after a rotation).
 *
 * Callers should treat a throw as "this connection needs reconnecting", not as
 * a transient failure worth retrying.
 */
export function decryptToken(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token: expected <iv>.<authTag>.<ciphertext>");
  }

  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(dataB64, "base64url");

  // Guard before handing to node:crypto, which errors opaquely on bad lengths.
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Malformed encrypted token: bad IV or auth tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(authTag);

  // final() throws if the auth tag doesn't verify — that IS the tamper check.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * 32 crypto-random bytes, base64url. Used for public report links
 * (`/r/[token]`) and one-click approval links.
 *
 * These are bearer tokens sent by email and pasted into browsers: anyone
 * holding one gets access, so they must be unguessable. `Math.random()` is not.
 */
export function generatePublicToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Constant-time string comparison for secrets (cron headers, webhook digests).
 *
 * `a === b` short-circuits on the first differing byte, leaking the length of
 * the matching prefix through timing. Length is compared first here because
 * timingSafeEqual throws on mismatched buffers — that leaks length only, which
 * is not secret for fixed-length digests.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
