"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/dal";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/db/notifications";

/**
 * Notification actions for the topbar bell. Both resolve the user from the
 * session (never a client-supplied userId) so one user can't mark another's
 * notifications read.
 */

export async function markRead(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const session = await requireSession();
  await markNotificationRead(id, session.uid);
  revalidatePath("/", "layout");
}

export async function markAllRead(): Promise<void> {
  const session = await requireSession();
  await markAllNotificationsRead(session.uid);
  revalidatePath("/", "layout");
}
