import { NextResponse } from "next/server";

import { runCompetitorSync } from "@/lib/competitor-engine";
import { isAuthorizedCron } from "@/lib/cron-auth";

/**
 * GET/POST /api/cron/competitors — daily public-data snapshots of every tracked
 * competitor. Idempotent: snapshots are keyed by date, so a re-run overwrites the
 * same day rather than duplicating.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCompetitorSync();
  return NextResponse.json(result);
}

export const POST = handle;
export const GET = handle;
