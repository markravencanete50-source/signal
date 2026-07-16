import "server-only";

import { adminDb } from "../firebase-admin";
import type { Platform, Sentiment } from "@/types";

/** Inbox items repository. Comments/mentions pulled by the sync engine. */

const COLLECTION = "inboxItems";

export interface InboxItem {
  id: string;
  brandId: string;
  workspaceId: string;
  platform: Platform;
  type: "comment" | "mention";
  externalId: string;
  postId?: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  sentiment: Sentiment;
  status: "open" | "assigned" | "replied" | "archived";
  assignedTo?: string;
  receivedAt: string;
}

/**
 * Create an inbox item if its externalId is new. Deduped by a deterministic id
 * so re-syncing the same comment doesn't create duplicates.
 */
export async function upsertInboxItem(
  input: Omit<InboxItem, "id" | "status"> & { status?: InboxItem["status"] },
): Promise<boolean> {
  const id = `${input.platform}_${input.externalId}`;
  const ref = adminDb().doc(`${COLLECTION}/${id}`);
  const existing = await ref.get();
  if (existing.exists) return false; // already ingested; don't reset its status

  const clean = Object.fromEntries(
    Object.entries({ status: "open", ...input }).filter(([, v]) => v !== undefined),
  );
  await ref.set(clean);
  return true;
}

export async function getInboxItem(id: string): Promise<InboxItem | null> {
  const snap = await adminDb().doc(`${COLLECTION}/${id}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as InboxItem;
}

/** Set an item's handling status (assign / archive / replied). */
export async function setInboxStatus(
  id: string,
  status: InboxItem["status"],
  assignedTo?: string,
): Promise<void> {
  const patch: Partial<InboxItem> = { status };
  if (assignedTo !== undefined) patch.assignedTo = assignedTo;
  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({ ...patch });
}

export async function listInbox(brandId: string, limit = 100): Promise<InboxItem[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("brandId", "==", brandId)
    .orderBy("receivedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InboxItem);
}

/** Count of open (unhandled) items — drives the sidebar Inbox badge. */
export async function countOpenInbox(brandId: string): Promise<number> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("brandId", "==", brandId)
    .where("status", "==", "open")
    .count()
    .get();
  return snap.data().count;
}
