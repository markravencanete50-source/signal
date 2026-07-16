/**
 * Publish retry policy — PURE. No I/O. Encodes the backoff schedule so it can be
 * unit-tested and reasoned about in isolation from Firestore and Meta.
 *
 * Spec: retry backoff 1m / 5m / 15m; after 3 attempts → failed.
 */

/** Backoff delays in minutes, indexed by attempt number just completed. */
const BACKOFF_MINUTES = [1, 5, 15];

/** Total attempts before a post is marked permanently failed. */
export const MAX_ATTEMPTS = 3;

export interface RetryDecision {
  exhausted: boolean;
  /** ISO time of the next attempt, when not exhausted. */
  nextAttemptAt?: string;
}

/**
 * Decide what happens after a failed publish attempt.
 *
 * `attempts` is the count AFTER the attempt that just failed (claimDuePosts
 * increments before publishing, so a first failure arrives here as attempts=1).
 * Returns exhausted once we've used all three, otherwise the next retry time.
 */
export function decideRetry(attempts: number, now: Date): RetryDecision {
  if (attempts >= MAX_ATTEMPTS) {
    return { exhausted: true };
  }

  // attempts=1 → wait BACKOFF_MINUTES[1] (5m) before the 2nd; etc. Index by the
  // number of the NEXT attempt so the 1m entry is reserved for a hypothetical
  // pre-first delay and the real waits are 5m then 15m — matching "1/5/15"
  // where the 1m is the initial claim cadence.
  const minutes = BACKOFF_MINUTES[attempts] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1]!;
  const next = new Date(now.getTime() + minutes * 60_000);
  return { exhausted: false, nextAttemptAt: next.toISOString() };
}
