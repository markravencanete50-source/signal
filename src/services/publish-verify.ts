/**
 * Publish-verification scheduling — PURE. No I/O.
 *
 * A successful publish only means Meta *accepted* the request; the post can
 * still fail to appear (API degradation, policy removal, silent drop). So after
 * publishing we wait a short while, then fetch the post back by id to confirm it
 * genuinely exists — the "verify-after-publish" step. This file holds the
 * timing so it can be unit-tested away from Firestore and the Graph API.
 *
 * Distinct from publish-policy.ts: that governs retrying a *failed* publish;
 * this governs re-checking a *claimed-successful* one.
 */

/** Wait this long after publishing before the first existence check — Meta needs a moment to propagate. */
export const VERIFY_DELAY_MINUTES = 3;

/** Give up (mark "unverified", no alarm) after this many can't-reach-Meta attempts. */
export const MAX_VERIFY_ATTEMPTS = 3;

/** Backoff between transient verify retries, minutes, indexed by attempts-so-far. */
const VERIFY_BACKOFF_MINUTES = [5, 15];

/** When the first verification check becomes due, given the publish time. */
export function verifyDueAt(publishedAtMs: number): string {
  return new Date(publishedAtMs + VERIFY_DELAY_MINUTES * 60_000).toISOString();
}

export interface VerifyReschedule {
  /** True once retries are used up — stop trying, mark it unverified. */
  exhausted: boolean;
  /** ISO time of the next check, when not exhausted. */
  nextDueAt?: string;
}

/**
 * After a *transient* verify attempt (couldn't reach Meta — rate limit, 5xx,
 * dead token), decide retry vs give up. `attempts` is the count AFTER the
 * attempt that just happened, mirroring publish-policy.decideRetry.
 */
export function decideVerifyRetry(attempts: number, now: Date): VerifyReschedule {
  if (attempts >= MAX_VERIFY_ATTEMPTS) return { exhausted: true };

  const minutes =
    VERIFY_BACKOFF_MINUTES[attempts - 1] ??
    VERIFY_BACKOFF_MINUTES[VERIFY_BACKOFF_MINUTES.length - 1]!;
  return { exhausted: false, nextDueAt: new Date(now.getTime() + minutes * 60_000).toISOString() };
}
