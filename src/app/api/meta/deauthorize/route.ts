import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/db/audit";
import { listConnectionsByMetaUser, markConnectionExpired } from "@/lib/db/connections";
import { env } from "@/lib/env";
import { parseSignedRequest } from "@/lib/meta/signed-request";

/**
 * POST /api/meta/deauthorize — Meta's deauthorize callback.
 *
 * Fires when a user removes the app from their Meta account. Public and
 * session-less; the ONLY authentication is the `signed_request` signature
 * (verified with the app secret), so an unsigned or forged body is rejected. On a
 * valid request we revoke every connection that user authorised — their token is
 * gone, so we mark them expired to stop publishing/sync and prompt a reconnect.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signed = await readSignedRequest(request);
  const payload = signed ? parseSignedRequest(signed, env().META_APP_SECRET) : null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid signed_request." }, { status: 400 });
  }

  const connections = await listConnectionsByMetaUser(payload.user_id);
  await Promise.all(
    connections.map(async (c) => {
      await markConnectionExpired(
        c.id,
        "The Meta account was disconnected — please reconnect.",
      ).catch(() => {});
      await recordAudit({
        workspaceId: c.workspaceId,
        actorId: "meta",
        actorName: "Meta",
        action: "connection.revoked",
        target: c.accountName,
        metadata: { platform: c.platform, via: "deauthorize callback" },
      }).catch(() => {});
    }),
  );

  return NextResponse.json({ ok: true, revoked: connections.length });
}

/** Meta posts `signed_request` as a form field. */
async function readSignedRequest(request: Request): Promise<string | null> {
  try {
    const form = await request.formData();
    const value = form.get("signed_request");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
