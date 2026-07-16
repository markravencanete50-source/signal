import "server-only";

import { adminDb } from "../firebase-admin";
import type { Competitor, CompetitorSnapshot, Platform } from "@/types";

/**
 * Competitors repository. Tracked profiles + a daily snapshot subcollection
 * (cron-written, deterministic id per date → idempotent). The latest snapshot and
 * 30-day growth are denormalised onto the parent doc so the table renders in one
 * read.
 */

const COLLECTION = "competitors";

export async function listCompetitors(brandId: string): Promise<Competitor[]> {
  const snap = await adminDb().collection(COLLECTION).where("brandId", "==", brandId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Competitor)
    .sort((a, b) => (b.latest?.followers ?? 0) - (a.latest?.followers ?? 0));
}

export async function getCompetitor(id: string): Promise<Competitor | null> {
  const snap = await adminDb().doc(`${COLLECTION}/${id}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Competitor;
}

/** Every tracked competitor across all tenants — the daily cron's work-list. */
export async function listAllCompetitors(): Promise<Competitor[]> {
  const snap = await adminDb().collection(COLLECTION).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Competitor);
}

export async function addCompetitor(input: {
  workspaceId: string;
  brandId: string;
  platform: Platform;
  handle: string;
  addedBy: string;
}): Promise<string> {
  const ref = adminDb().collection(COLLECTION).doc();
  const competitor: Omit<Competitor, "id"> = {
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    platform: input.platform,
    handle: input.handle,
    displayName: input.handle.replace(/^@/, ""),
    addedBy: input.addedBy,
    createdAt: new Date().toISOString(),
    growth30dPct: null,
  };
  await ref.set(competitor);
  return ref.id;
}

export async function removeCompetitor(id: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).delete();
}

/**
 * Write a day's snapshot and refresh the denormalised latest/growth on the
 * parent. Deterministic doc id (the date) means a same-day re-run overwrites
 * rather than duplicates.
 */
export async function recordSnapshot(
  competitorId: string,
  snapshot: CompetitorSnapshot,
  displayName?: string,
): Promise<void> {
  const db = adminDb();
  const parent = db.doc(`${COLLECTION}/${competitorId}`);
  await parent.collection("snapshots").doc(snapshot.date).set(snapshot);

  const growth30dPct = await computeGrowth(competitorId, snapshot);
  await parent.update({
    latest: snapshot,
    growth30dPct,
    // Refresh the display name from the fetched profile when we have one.
    ...(displayName ? { displayName } : {}),
  });
}

async function computeGrowth(
  competitorId: string,
  today: CompetitorSnapshot,
): Promise<number | null> {
  // Find the oldest snapshot within the trailing ~31 days to compare against.
  const cutoff = new Date(new Date(today.date).getTime() - 31 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const snap = await adminDb()
    .collection(`${COLLECTION}/${competitorId}/snapshots`)
    .where("date", ">=", cutoff)
    .where("date", "<", today.date)
    .orderBy("date", "asc")
    .limit(1)
    .get();

  const baseline = snap.docs[0]?.data() as CompetitorSnapshot | undefined;
  if (!baseline || baseline.followers <= 0) return null;
  return Math.round(((today.followers - baseline.followers) / baseline.followers) * 1000) / 10;
}
