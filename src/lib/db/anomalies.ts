import "server-only";

import { adminDb } from "../firebase-admin";
import type { Anomaly } from "@/types/metrics";

/** Anomalies repository. Written by the sync engine; read by Pulse + Dashboard. */

const COLLECTION = "anomalies";

/**
 * Record an anomaly, deduped by (brandId, platform, date).
 *
 * The sync cron runs hourly, but a reach drop is a once-per-day fact — without
 * the date key, every hourly run would log the same drop 24 times. The
 * deterministic id makes re-recording a no-op update.
 */
export async function recordAnomaly(input: Omit<Anomaly, "id">): Promise<void> {
  const date = input.detectedAt.slice(0, 10);
  const id = `${input.brandId ?? "workspace"}_${input.platform}_${date}`;
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  await adminDb().doc(`${COLLECTION}/${id}`).set(clean, { merge: true });
}

/** Was this brand+platform already flagged today? Lets the engine skip re-notifying. */
export async function anomalyExistsToday(
  brandId: string,
  platform: string,
  dateIso: string,
): Promise<boolean> {
  const id = `${brandId}_${platform}_${dateIso.slice(0, 10)}`;
  const snap = await adminDb().doc(`${COLLECTION}/${id}`).get();
  return snap.exists;
}

export async function listAnomalies(workspaceId: string, limit = 20): Promise<Anomaly[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .orderBy("detectedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Anomaly);
}

/** The most recent unresolved anomaly, for the dashboard banner. */
export async function latestAnomaly(workspaceId: string): Promise<Anomaly | null> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .orderBy("detectedAt", "desc")
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...doc.data() } as Anomaly;
}
