import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { refreshExpiringTokens } from "@/lib/token-refresh";

/**
 * GET/POST /api/cron/tokens — refreshes Meta tokens nearing expiry. Runs daily
 * (scheduled in vercel.json). Idempotent: a connection already refreshed today
 * simply falls outside the expiry window on the next run.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshExpiringTokens();
  return NextResponse.json(result);
}

export const POST = handle;
export const GET = handle;
