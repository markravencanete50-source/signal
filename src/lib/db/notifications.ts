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
