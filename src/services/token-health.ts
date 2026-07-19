/**
 * Token-health scheduling logic — pure, no I/O.
 *
 * Meta connections have two independent expiry clocks:
 *   - the access token itself (~60 days), which the refresh cron keeps alive
 *     silently, and
 *   - the user's *data-access* grant (~90 days), which a token refresh CANNOT
 *     extend — only a fresh reconnect through the login dialog can.
 *
 * The monitor warns about whichever binds soonest, and it must warn at most
 * once per severity band so admins get a heads-up, not a daily nag. This file
 * holds the band + dedup maths so it can be unit-tested without Firestore or
 * the Graph API.
 */

/** Days-before-expiry at which to warn, strictest last. */
export const TOKEN_WARNING_THRESHOLDS = [14, 7, 3, 1] as const;

const MAX_THRESHOLD = Math.max(...TOKEN_WARNING_THRESHOLDS);

/**
 * The soonest real expiry in ms among the two clocks, or null when neither
 * expires. Meta encodes "never expires" as 0 (page tokens are often
 * non-expiring), so any non-positive value is treated as "no deadline".
 */
export function effectiveExpiryMs(
  tokenExpiresAtMs: number | null,
  dataAccessExpiresAtMs: number | null,
): number | null {
  const candidates = [tokenExpiresAtMs, dataAccessExpiresAtMs].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  return candidates.length ? Math.min(...candidates) : null;
}

/** Whole days from `nowMs` to `expiryMs` (floored; negative once past). */
export function daysUntil(expiryMs: number, nowMs: number): number {
  return Math.floor((expiryMs - nowMs) / 86_400_000);
}

/**
 * The warning band to fire now, or null for none.
 *
 * Returns the strictest (smallest) threshold `daysLeft` has crossed, but only
 * when it is stricter than the band we last warned at — so each band fires
 * exactly once as expiry approaches. `alreadyWarnedAt` is the smallest band
 * previously warned; null means never warned.
 */
export function warningThresholdToFire(
  daysLeft: number,
  alreadyWarnedAt: number | null,
): number | null {
  const crossed = TOKEN_WARNING_THRESHOLDS.filter((t) => daysLeft <= t);
  if (!crossed.length) return null;

  const strictest = Math.min(...crossed);
  // Already warned at this band or a stricter one — stay quiet.
  if (alreadyWarnedAt !== null && alreadyWarnedAt <= strictest) return null;
  return strictest;
}

/**
 * True when a connection is far enough from expiry that any prior warning state
 * should be cleared — so a reconnect (which pushes the deadline back out) resets
 * the cycle and the bands can fire afresh next time.
 */
export function shouldResetWarning(daysLeft: number): boolean {
  return daysLeft > MAX_THRESHOLD;
}
