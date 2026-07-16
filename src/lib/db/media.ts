import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "../firebase-admin";
import type { MediaAsset } from "@/types/media";

/** Media assets repository. */

const COLLECTION = "mediaAssets";

function docToAsset(id: string, data: FirebaseFirestore.DocumentData): MediaAsset {
  return { id, usage: [], tags: [], ...data } as unknown as MediaAsset;
}

export async function getAsset(id: string): Promise<MediaAsset | null> {
  const snap = await adminDb().doc(`${COLLECTION}/${id}`).get();
  if (!snap.exists) return null;
  return docToAsset(snap.id, snap.data()!);
}

export async function listAssets(workspaceId: string): Promise<MediaAsset[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return snap.docs.map((d) => docToAsset(d.id, d.data()));
}

export async function createAsset(input: Omit<MediaAsset, "id">): Promise<string> {
  const ref = adminDb().collection(COLLECTION).doc();
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  await ref.set(clean);
  return ref.id;
}

/**
 * Record that an asset was used in a post, for the library's usage badges.
 *
 * arrayUnion-style append via a transaction so concurrent uses on the same asset
 * don't clobber each other's entries.
 */
export async function recordUsage(
  assetId: string,
  usage: { postId: string; platform: "fb" | "ig" },
): Promise<void> {
  await adminDb()
    .doc(`${COLLECTION}/${assetId}`)
    .update({
      usage: FieldValue.arrayUnion({ ...usage, usedAt: new Date().toISOString() }),
    });
}

export async function updateAssetTags(assetId: string, tags: string[]): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${assetId}`).update({ tags });
}

export async function deleteAssetDoc(assetId: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${assetId}`).delete();
}
