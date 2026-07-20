import { NextResponse, type NextRequest } from "next/server";

import { safeEqual } from "@/lib/crypto";
import { verifyHubSignature } from "@/lib/meta/webhook-signature";

/**
 * Meta webhook endpoint (`/api/webhooks/meta`).
 *
 * GET  — the one-time verification handshake. Meta calls with `hub.mode`,
 *        `hub.verify_token` and `hub.challenge`; when the token matches ours we
 *        echo the challenge back as `text/plain`, which is how Meta confirms we
 *        own the endpoint. A mismatch is 403. App Review runs this handshake, so
 *        the endpoint must exist and pass before the app can be submitted.
 *
 * POST — event delivery. Public and session-less; authenticated ONLY by the
 *        `X-Hub-Signature-256` HMAC over the raw body (keyed with the app
 *        secret). An unsigned or tampered body is rejected before the payload is
 *        touched — this is the security boundary for the endpoint.
 *
 * Signal currently *polls* comments in the sync engine rather than reacting to
 * pushed events, so a verified POST is acknowledged fast and no event is routed
 * yet. Wiring specific fields (e.g. `comments`) into the Unified Inbox is a
 * later step; the endpoint exists now because review verifies it at submission.
 *
 * Reads `process.env` directly (like the Stripe webhook) rather than through
 * `env()`: this public URL is hit by Meta's crawler even mid-setup, and it must
 * not 500 because some *unrelated* secret is absent. Missing Meta config → 503.
 */
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return new NextResponse("Webhook not configured.", { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  // safeEqual, not ===: the compare involves a server secret, and constant-time
  // is free — same discipline as the cron header and HMAC digests.
  if (mode === "subscribe" && token && safeEqual(token, verifyToken) && challenge) {
    // Meta requires the raw challenge echoed as text/plain — a JSON-wrapped or
    // quoted value fails verification.
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new NextResponse("Verification failed.", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  // The raw body is required for signature verification — read it as text and
  // never JSON.parse before the signature checks out.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyHubSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  // Signature verified. Nothing to route yet (comments are polled), so
  // acknowledge immediately — Meta retries any non-2xx and disables a webhook
  // that fails repeatedly.
  return NextResponse.json({ received: true });
}
