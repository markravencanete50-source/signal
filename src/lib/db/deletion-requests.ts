import "server-only";

import { adminDb } from "../firebase-admin";

/**
 * Data-deletion request log. Meta's data-deletion callback must hand back a
 * `confirmation_code` and a status `url` the user can check; this records the
 * request under that code so `/data-deletion/[code]` can report progress. The
 * personal data we actually hold for a Meta user is their connection(s), so
 * "deletion" means revoking those.
 */

const COLLECTION = "metaDeletionRequests";

export type DeletionStatus = "received" | "completed";

export interface DeletionRequest {
  code: string;
  metaUserId: string;
  status: DeletionStatus;
  connectionsRemoved: number;
  requestedAt: string;
  completedAt?: string;
}

export async function createDeletionRequest(input: {
  code: string;
  metaUserId: string;
  connectionsRemoved: number;
}): Promise<void> {
  const now = new Date().toISOString();
  await adminDb()
    .doc(`${COLLECTION}/${input.code}`)
    .set({
      code: input.code,
      metaUserId: input.metaUserId,
      status: "completed" satisfies DeletionStatus,
      connectionsRemoved: input.connectionsRemoved,
      requestedAt: now,
      completedAt: now,
    });
}

export async function getDeletionRequest(code: string): Promise<DeletionRequest | null> {
  const snap = await adminDb().doc(`${COLLECTION}/${code}`).get();
  if (!snap.exists) return null;
  return snap.data() as DeletionRequest;
}
