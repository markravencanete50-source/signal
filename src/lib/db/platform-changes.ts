import "server-only";

import { adminDb } from "../firebase-admin";
import type { PlatformChange } from "@/types/metrics";

/**
 * Platform-changes feed — the admin-curated "what changed on the platforms"
 * list shown in Pulse. Not synced; owners/admins add entries by hand.
 */

const COLLECTION = "platformChanges";

export async function listPlatformChanges(workspaceId: string): Promise<PlatformChange[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlatformChange);
}

export async function createPlatformChange(input: {
  workspaceId: string;
  period: string;
  body: string;
  createdBy: string;
}): Promise<void> {
  await adminDb()
    .collection(COLLECTION)
    .add({ ...input, createdAt: new Date().toISOString() });
}

export async function deletePlatformChange(id: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).delete();
}
