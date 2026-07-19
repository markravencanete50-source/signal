import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { monitorTokenHealth } from "@/lib/token-health";
import { refreshExpiringTokens } from "@/lib/token-refresh";

/**
 * GET/POST /api/cron/tokens — keeps Meta connections alive. Runs daily
 * (scheduled via the GitHub Actions cron). Idempotent.
 *
 * Two passes, in order:
 *   1. refresh — renew any access token nearing its own expiry (silent, no user
 *      action needed).
 *   2. health monitor — validate each token against Meta and fire graduated
 *      pre-expiry warnings for the things a refresh CAN'T fix (revoked tokens,
 *      data-access expiry). Runs second so a just-refreshed token is never
 *      warned about.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refresh = await refreshExpiringTokens();
  const health = await monitorTokenHealth();
  return NextResponse.json({ refresh, health });
}

export const POST = handle;
export const GET = handle;
