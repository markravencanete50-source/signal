import "server-only";

import { adminDb } from "../firebase-admin";
import { nextRunFrom } from "@/services/autolist";
import type { Autolist, AutolistItem } from "@/types";

/**
 * Autolists repository. Evergreen queues + RSS feeds that publish on a cadence.
 *
 * `claimDueAutolists` mirrors the publish engine's lock: it advances `nextRunAt`
 * inside a transaction BEFORE the caller acts, so two overlapping cron ticks
 * can't run the same autolist twice (idempotent + re-runnable).
 */

const COLLECTION = "autolists";

export async function getAutolist(id: string): Promise<Autolist | null> {
  const snap = await adminDb().doc(`${COLLECTION}/${id}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Autolist;
}

export async function listAutolists(brandId: string): Promise<Autolist[]> {
  const snap = await adminDb().collection(COLLECTION).where("brandId", "==", brandId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Autolist)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type CreateAutolistInput = Omit<
  Autolist,
  "id" | "cursor" | "createdAt" | "updatedAt" | "lastRunAt" | "seenLinks"
>;

export async function createAutolist(input: CreateAutolistInput): Promise<string> {
  const ref = adminDb().collection(COLLECTION).doc();
  const now = new Date().toISOString();
  const clean = Object.fromEntries(
    Object.entries({
      ...input,
      cursor: 0,
      seenLinks: [],
      createdAt: now,
      updatedAt: now,
    }).filter(([, v]) => v !== undefined),
  );
  await ref.set(clean);
  return ref.id;
}

export async function setAutolistEnabled(id: string, enabled: boolean): Promise<void> {
  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({ enabled, updatedAt: new Date().toISOString() });
}

export async function deleteAutolist(id: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).delete();
}

/** Persist the mutated queue/cursor/run-state after an engine cycle. */
export async function saveAutolistProgress(
  id: string,
  patch: Partial<
    Pick<Autolist, "items" | "cursor" | "nextRunAt" | "lastRunAt" | "seenLinks" | "enabled">
  >,
): Promise<void> {
  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({ ...patch, updatedAt: new Date().toISOString() });
}

/**
 * Claim the autolists due at or before `now`, advancing each one's `nextRunAt` by
 * its cadence in a transaction so a concurrent tick sees it as not-yet-due. The
 * caller then does the (slower) publishing work outside the lock.
 *
 * Requires the composite index on (enabled, nextRunAt).
 */
export async function claimDueAutolists(now: Date): Promise<Autolist[]> {
  const nowIso = now.toISOString();
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("enabled", "==", true)
    .where("nextRunAt", "<=", nowIso)
    .get();

  const claimed: Autolist[] = [];
  const db = adminDb();

  for (const doc of snap.docs) {
    try {
      const autolist = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const data = fresh.data() as Omit<Autolist, "id"> | undefined;
        // Re-check under the lock: another tick may have claimed it already.
        if (!data || !data.enabled || data.nextRunAt > nowIso) return null;

        tx.update(doc.ref, {
          nextRunAt: nextRunFrom(now, data.cadenceDays),
          lastRunAt: nowIso,
        });
        return { id: doc.id, ...data } as Autolist;
      });
      if (autolist) claimed.push(autolist);
    } catch {
      // A contended transaction just means someone else got it — skip.
    }
  }

  return claimed;
}

/** Update a single queue item in place (e.g. after publishing or retiring it). */
export function replaceItem(items: AutolistItem[], updated: AutolistItem): AutolistItem[] {
  return items.map((it) => (it.id === updated.id ? updated : it));
}
