import { NextResponse, type NextRequest } from "next/server";

import { getAdapter } from "@/adapters/registry";
import { requireBrandAccess } from "@/lib/auth/dal";
import { consumeOAuthState } from "@/lib/auth/oauth-state";
import { getCurrentUser } from "@/lib/auth/dal";
import { recordAudit } from "@/lib/db/audit";
import { upsertConnection } from "@/lib/db/connections";
import { ADMIN_ROLES } from "@/types";

/**
 * Meta OAuth callback.
 *
 * The security-critical step of Phase 1: this is where a platform token enters
 * the system. Order matters and is deliberate:
 *
 *   1. verify `state` (CSRF + this-browser binding)  — before touching `code`
 *   2. re-authorise the caller against the brand      — state is not authorisation
 *   3. exchange code → LONG-LIVED token via adapter
 *   4. encrypt and store; the plaintext token never leaves this request
 *
 * Step 2 is not redundant: state proves the request wasn't forged, not that the
 * user still has admin rights on that brand. Roles can change mid-flow.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const settingsUrl = (msg: string, ok = false) => {
    const url = request.nextUrl.clone();
    url.pathname = "/settings/connections";
    url.search = "";
    url.searchParams.set(ok ? "connected" : "error", msg);
    return NextResponse.redirect(url);
  };

  // The user pressed Cancel on Meta's consent screen — not an error worth a
  // scary message.
  const oauthError = params.get("error");
  if (oauthError) {
    const desc = params.get("error_description") ?? oauthError;
    return settingsUrl(
      oauthError === "access_denied" ? "Connection cancelled — no changes were made." : desc,
    );
  }

  const state = await consumeOAuthState(params.get("state"));
  if (!state) {
    return settingsUrl(
      "That connection link is invalid or has expired. Start the connection again.",
    );
  }

  const code = params.get("code");
  if (!code) return settingsUrl("Meta didn't return an authorisation code. Please try again.");

  try {
    // Authorise NOW, against the brand encoded in the verified state.
    const { workspaceId } = await requireBrandAccess(state.brandId, ADMIN_ROLES);
    const user = await getCurrentUser();

    const adapter = getAdapter(state.platform);
    const tokens = await adapter.exchangeCode(code);

    // upsertConnection encrypts (AES-256-GCM) before the token touches
    // Firestore. Nothing here returns it to the browser.
    await upsertConnection({
      brandId: state.brandId,
      workspaceId,
      platform: state.platform,
      tokens,
      connectedByName: user?.name,
    });

    await recordAudit({
      workspaceId,
      actorId: user?.uid ?? "unknown",
      actorName: user?.name ?? user?.email ?? "A teammate",
      action: "connection.connected",
      target: tokens.accountName,
      metadata: { platform: state.platform },
    }).catch(() => {});

    return settingsUrl(`${tokens.accountName} connected.`, true);
  } catch (err) {
    // Surface the adapter's message — they're written for humans ("No Instagram
    // Business account is linked to your Page…") and are the actionable part.
    const message =
      err instanceof Error ? err.message : "Could not complete the connection. Please try again.";
    return settingsUrl(message);
  }
}
