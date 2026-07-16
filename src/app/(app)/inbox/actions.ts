"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAdapter } from "@/adapters/registry";
import { requireBrandAccess } from "@/lib/auth/dal";
import { getDecryptedToken, listConnectionsForBrand } from "@/lib/db/connections";
import { getInboxItem, setInboxStatus } from "@/lib/db/inbox";
import { WRITER_ROLES } from "@/types";

/**
 * Inbox actions: send a reply, or change an item's status. Both authorise the
 * caller against the item's brand first — the Admin SDK ignores Firestore rules.
 * Replies go out through the adapter (the only Graph API touchpoint), using the
 * brand's stored, decrypted connection token — mirroring the publish engine.
 */

export type InboxActionState = { error?: string; ok?: boolean };

const replySchema = z.object({
  itemId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

export async function sendReply(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const parsed = replySchema.safeParse({
    itemId: formData.get("itemId"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { error: "Write a reply first." };

  const item = await getInboxItem(parsed.data.itemId);
  if (!item) return { error: "This message no longer exists." };

  try {
    await requireBrandAccess(item.brandId, WRITER_ROLES);

    const connection = (await listConnectionsForBrand(item.brandId)).find(
      (c) => c.platform === item.platform,
    );
    if (!connection) {
      return { error: `No ${item.platform.toUpperCase()} account is connected for this brand.` };
    }

    const token = await getDecryptedToken(connection);
    await getAdapter(item.platform).replyToComment(
      connection,
      token,
      item.externalId,
      parsed.data.message,
    );

    await setInboxStatus(item.id, "replied");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the reply." };
  }

  revalidatePath("/inbox");
  return { ok: true };
}

const statusSchema = z.object({
  itemId: z.string().min(1),
  status: z.enum(["open", "assigned", "replied", "archived"]),
});

export async function updateStatus(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const parsed = statusSchema.safeParse({
    itemId: formData.get("itemId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const item = await getInboxItem(parsed.data.itemId);
  if (!item) return { error: "This message no longer exists." };

  try {
    const { session } = await requireBrandAccess(item.brandId, WRITER_ROLES);
    await setInboxStatus(
      item.id,
      parsed.data.status,
      parsed.data.status === "assigned" ? session.uid : undefined,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the message." };
  }

  revalidatePath("/inbox");
  return { ok: true };
}
