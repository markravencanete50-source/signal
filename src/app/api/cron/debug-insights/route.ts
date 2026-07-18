import { NextResponse } from "next/server";

import { GRAPH_BASE } from "@/adapters/meta-client";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getDecryptedToken, listActiveConnections } from "@/lib/db/connections";

/**
 * TEMPORARY diagnostic route — same auth as the real cron routes. Lets us test
 * individual Page Insights metric names against the real stored token without
 * a redeploy per guess, since Graph's "(#100) must be a valid insights metric"
 * error doesn't say which metric in a comma list is bad.
 *
 * Usage: GET /api/cron/debug-insights?metric=page_fans (x-cron-secret header)
 * DELETE THIS FILE once the real metric list is confirmed working.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metric = new URL(request.url).searchParams.get("metric");
  if (!metric) {
    return NextResponse.json({ error: "Pass ?metric=..." }, { status: 400 });
  }

  const connections = await listActiveConnections();
  const conn = connections.find((c) => c.platform === "fb");
  if (!conn) {
    return NextResponse.json({ error: "No active fb connection" }, { status: 404 });
  }

  const token = await getDecryptedToken(conn);
  const now = Date.now();
  const since = Math.floor((now - 14 * 86_400_000) / 1000).toString();
  const until = Math.floor(now / 1000).toString();

  const url = new URL(`${GRAPH_BASE}/${conn.pageId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("period", "day");
  url.searchParams.set("since", since);
  url.searchParams.set("until", until);
  url.searchParams.set("access_token", token);

  const res = await fetch(url);
  const body = await res.text();

  return NextResponse.json({ metric, status: res.status, body: JSON.parse(body) });
}
