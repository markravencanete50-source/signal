import { NextResponse } from "next/server";

import { GRAPH_BASE } from "@/adapters/meta-client";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { getDecryptedToken, listActiveConnections } from "@/lib/db/connections";

/**
 * TEMPORARY diagnostic route — inspect the actual granted scopes on the real
 * stored Facebook token via Graph's /debug_token, to see whether
 * pages_read_engagement really made it into the grant. DELETE once resolved.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await listActiveConnections();
  const conn = connections.find((c) => c.platform === "fb");
  if (!conn) {
    return NextResponse.json({ error: "No active fb connection" }, { status: 404 });
  }

  const token = await getDecryptedToken(conn);
  const { META_APP_ID, META_APP_SECRET } = env();
  const appToken = `${META_APP_ID}|${META_APP_SECRET}`;

  const url = new URL(`${GRAPH_BASE}/debug_token`);
  url.searchParams.set("input_token", token);
  url.searchParams.set("access_token", appToken);

  const res = await fetch(url);
  const body = await res.json();

  return NextResponse.json({ status: res.status, body });
}
