import "server-only";

import { adminDb } from "../firebase-admin";
import type { Notification } from "@/types";

/** Notifications repository. Written server-side only (rules deny client create). */

const COLLECTION = "notifications";

export async function createNotification(input: {
  userId: string;
  workspaceId: string;
  title: string;
  body: string;
  href?: string;
}): Promise<void> {
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  await adminDb()
    .collection(COLLECTION)
    .add({ ...clean, createdAt: new Date().toISOString() });
}

/** Notify every owner/admin of a workspace — used for publish failures, anomalies. */
export async function notifyWorkspaceAdmins(
  workspaceId: string,
  notification: { title: string; body: string; href?: string },
): Promise<void> {
  const members = await adminDb().collection(`workspaces/${workspaceId}/members`).get();

  const admins = members.docs.filter((d) => {
    const role = d.data().role;
    return role === "owner" || role === "admin";
  });

  await Promise.all(
    admins.map((m) => createNotification({ userId: m.id, workspaceId, ...notification })),
  );
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Notification);
}

/**
 * Mark one notification read — but only if it belongs to `userId`. The ownership
 * check matters: the id comes from the client, and the Admin SDK bypasses the
 * rule that would otherwise scope this.
 */
export async function markNotificationRead(id: string, userId: string): Promise<void> {
  const ref = adminDb().doc(`${COLLECTION}/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== userId) return;
  if (snap.data()?.readAt) return; // already read
  await ref.update({ readAt: new Date().toISOString() });
}

/**
 * Mark all of a user's unread notifications read, in one batch.
 *
 * Unread = `readAt` absent. We can't query that directly (Firestore's `== null`
 * matches explicit nulls, not missing fields, and `createNotification` never
 * writes the field), so we scan the user's recent notifications and update the
 * ones without a `readAt`.
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const unread = snap.docs.filter((d) => !d.data().readAt);
  if (unread.length === 0) return;

  const now = new Date().toISOString();
  const batch = adminDb().batch();
  unread.forEach((d) => batch.update(d.ref, { readAt: now }));
  await batch.commit();
}
