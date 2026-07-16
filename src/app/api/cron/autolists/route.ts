import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { runAutolists } from "@/lib/autolist-engine";

/**
 * GET/POST /api/cron/autolists — runs due evergreen queues and RSS feeds. Hourly;
 * each autolist fires on its own day cadence (nextRunAt). Idempotent — due
 * autolists are claimed under a transaction lock before any post is created.
 */
export const dynamic = "force-dynamic";
// Evergreen publishes + per-platform AI rewrites for RSS can run long.
export const maxDuration = 300;

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runAutolists();
  return NextResponse.json(result);
}

export const POST = handle;
export const GET = handle;
