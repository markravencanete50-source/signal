"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAdapter } from "@/adapters/registry";
import { requireBrandAccess } from "@/lib/auth/dal";
import { createOAuthState } from "@/lib/auth/oauth-state";
import { deleteConnection, getConnection } from "@/lib/db/connections";
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
