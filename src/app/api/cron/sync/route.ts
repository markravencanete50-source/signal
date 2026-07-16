import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { runSync } from "@/lib/sync-engine";

/**
 * GET/POST /api/cron/sync — the sync engine's clock. Runs hourly.
 *
 * Pulls account + post insights, computes intent scores, detects cross-brand
 * anomalies, and ingests comments with sentiment. Idempotent (deterministic doc
 * ids), so a re-run is harmless.
 */
export const dynamic = "force-dynamic";
// Insights + AI classification across many connections can run long; give it
// room beyond the default serverless timeout.
export const maxDuration = 300;

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSync();
  return NextResponse.json(result);
}

export const POST = handle;
export const GET = handle;
