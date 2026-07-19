import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { runPublishVerification } from "@/lib/publish-verify";

/**
 * GET/POST /api/cron/verify — the verify-after-publish pass. Runs on the same
 * every-5-minutes tick as publish (via the GitHub Actions cron). A post
 * published this tick won't be due for ~3 minutes, so it's picked up on a later
 * run. Idempotent.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPublishVerification();
  return NextResponse.json(result);
}

export const POST = handle;
export const GET = handle;
