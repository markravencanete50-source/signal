import { NextResponse } from "next/server";

import { deleteConnection, listConnectionsByMetaUser } from "@/lib/db/connections";
import { generatePublicToken } from "@/lib/crypto";
import { createDeletionRequest } from "@/lib/db/deletion-requests";
import { env } from "@/lib/env";
import { parseSignedRequest } from "@/lib/meta/signed-request";

/**
 * POST /api/meta/data-deletion — Meta's data-deletion request callback.
 *
 * Public and session-less; authenticated solely by the `signed_request`
 * signature. The personal data we hold for a Meta user is their connection(s)
 * (which carry the access token they granted), so deletion = removing those. We
 * log the request under a confirmation code and return the `{ url, confirmation_code }`
 * shape Meta requires, pointing at a public status page.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signed = await readSignedRequest(request);
  const payload = signed ? parseSignedRequest(signed, env().META_APP_SECRET) : null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid signed_request." }, { status: 400 });
  }

  const connections = await listConnectionsByMetaUser(payload.user_id);
  await Promise.all(connections.map((c) => deleteConnection(c.id).catch(() => {})));

  const code = generatePublicToken();
  await createDeletionRequest({
    code,
    metaUserId: payload.user_id,
    connectionsRemoved: connections.length,
  });

  return NextResponse.json({
    url: `${env().APP_URL}/data-deletion/${code}`,
    confirmation_code: code,
  });
}

async function readSignedRequest(request: Request): Promise<string | null> {
  try {
    const form = await request.formData();
    const value = form.get("signed_request");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
