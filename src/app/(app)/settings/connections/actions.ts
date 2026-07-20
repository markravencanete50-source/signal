"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAdapter } from "@/adapters/registry";
import { requireBrandAccess } from "@/lib/auth/dal";
import { createOAuthState } from "@/lib/auth/oauth-state";
import { deleteConnection, getConnection } from "@/lib/db/connections";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncBrandNow, type ManualSyncResult } from "@/lib/sync-engine";
import { ADMIN_ROLES } from "@/types";

const connectSchema = z.object({
  brandId: z.string().min(1),
  platform: z.enum(["fb", "ig"]),
});

/**
 * Start the Meta OAuth flow.
 *
 * Returns nothing — it redirects. The URL is built server-side by the adapter
 * so the app id and scope list never ship to the browser, and the state is
 * minted here so its nonce cookie is set on the same response.
 */
export async function startConnect(formData: FormData): Promise<void> {
  const parsed = connectSchema.safeParse({
    brandId: formData.get("brandId"),
    platform: formData.get("platform"),
  });

  if (!parsed.success) throw new Error("Invalid connect request.");

  // Only owners/admins may bind an account to a brand.
  await requireBrandAccess(parsed.data.brandId, ADMIN_ROLES);

  const state = await createOAuthState(parsed.data.brandId, parsed.data.platform);
  const url = getAdapter(parsed.data.platform).buildAuthUrl(state);

  redirect(url);
}

/**
 * Disconnect an account.
 *
 * Deleting the row is what actually revokes Signal's access *for us* — the
 * publish and sync crons iterate connections, so no row means no further calls.
 * The user should also remove the app from Meta's Business Integrations to kill
 * the token at source; that's surfaced in the UI rather than done here, because
 * revoking centrally would break any other integration sharing the app.
 */
export async function disconnect(formData: FormData): Promise<void> {
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection id.");

  // Resolve the brand from the connection itself — never trust a client-supplied
  // brandId alongside it, or a caller could pair their own brand with someone
  // else's connection and delete it.
  const connection = await getConnection(connectionId);
  if (!connection) return;

  await requireBrandAccess(connection.brandId, ADMIN_ROLES);
  await deleteConnection(connectionId);

  revalidatePath("/settings/connections");
}

export interface SyncNowResult {
  ok: boolean;
  at: string;
  connections: ManualSyncResult[];
  error?: string;
}

/**
 * Run a sync for this brand's connections right now.
 *
 * The in-app counterpart to the hourly cron, for when an admin doesn't want to
 * wait an hour (or check the GitHub Actions tab) to see whether capture works.
 * Admin-only and scoped to the brand — `syncBrandNow` never reaches another
 * tenant. Returns a per-connection summary; revalidates the pages whose data it
 * refreshes so Analytics reflects the new metrics on the next view.
 */
export async function runSyncNow(brandId: string): Promise<SyncNowResult> {
  await requireBrandAccess(brandId, ADMIN_ROLES);

  const at = new Date().toISOString();

  // Meta Graph quota is per-APP, shared by every tenant — a spamming admin
  // could starve everyone else's sync. Admin-only isn't enough of a brake.
  const limit = checkRateLimit(await headers(), "sync");
  if (!limit.ok) {
    return {
      ok: false,
      at,
      connections: [],
      error: `Sync just ran. Try again in ${limit.retryAfterSec}s.`,
    };
  }
  try {
    const connections = await syncBrandNow(brandId);
    revalidatePath("/settings/connections");
    revalidatePath("/analytics");
    revalidatePath("/pulse");
    return { ok: true, at, connections };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Sync failed to run.";
    return { ok: false, at, connections: [], error };
  }
}
