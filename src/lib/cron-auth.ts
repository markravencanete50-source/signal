import "server-only";

import { env } from "./env";
import { safeEqual } from "./crypto";

/**
 * Cron route authorisation.
 *
 * Cron endpoints publish, spend money (AI, Meta), and mutate every tenant's
 * data — they must never be publicly triggerable. Every cron route calls this
 * first and 401s on failure.
 *
 * Vercel Cron sends the secret as `Authorization: Bearer <CRON_SECRET>`. An
 * external scheduler (the Hobby-plan fallback, DECISIONS #007) can send the same
 * value as `x-cron-secret`. Both are accepted; the comparison is constant-time.
 */
export function isAuthorizedCron(request: Request): boolean {
  const expected = env().CRON_SECRET;

  const header = request.headers.get("x-cron-secret");
  if (header && safeEqual(header, expected)) return true;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return safeEqual(auth.slice("Bearer ".length), expected);
  }

  return false;
}
