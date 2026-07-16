import "server-only";

import { adminDb } from "../firebase-admin";
import type { AuditLog } from "@/types";

/**
 * Audit-log repository. Append-only, server-written (Firestore rules deny every
 * client write; admins may read their own workspace's entries). Recording is
 * best-effort at the call sites — an audit write must never break the action it
 * records — so callers wrap it in `.catch(() => {})`.
 */

const COLLECTION = "auditLogs";

export async function recordAudit(entry: {
  workspaceId: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const clean = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined));
  await adminDb()
    .collection(COLLECTION)
    .add({ ...clean, createdAt: new Date().toISOString() });
}

/** Recent entries for the admin audit viewer. Needs the (workspaceId, createdAt) index. */
export async function listAuditLogs(workspaceId: string, max = 100): Promise<AuditLog[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .orderBy("createdAt", "desc")
    .limit(max)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLog);
}
