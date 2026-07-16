import "server-only";

import { generateNarrative } from "../ai/narrative";
import { generatePublicToken } from "../crypto";
import { adminDb } from "../firebase-admin";
import { PERIOD_LABELS, buildSnapshot, resolvePeriod } from "../reports/snapshot";
import { FieldValue } from "firebase-admin/firestore";
import type { Report, ReportDigest, ReportPeriod } from "@/types";

/**
 * Reports repository.
 *
 * A report stores its computed aggregates (DECISIONS #005), so the public page
 * renders from the document alone — no Graph API call on view, and no public
 * Firestore read (the token is resolved server-side via the Admin SDK, like
 * approvals — DECISIONS #006).
 */

const COLLECTION = "reports";

/**
 * Create a report: resolve the window, snapshot the stored metrics, generate the
 * narrative, mint a public token, and persist. `now` is injected so the window
 * is deterministic for the caller/tests.
 */
export async function createReport(params: {
  workspaceId: string;
  title: string;
  period: ReportPeriod;
  brandIds: string[];
  createdBy: string;
  now: Date;
}): Promise<Report> {
  const window = resolvePeriod(params.period, params.now);
  const snapshot = await buildSnapshot(params.brandIds, window);
  const narrative = await generateNarrative(snapshot, PERIOD_LABELS[params.period]);

  const ref = adminDb().collection(COLLECTION).doc();
  const nowIso = params.now.toISOString();
  const report: Omit<Report, "id"> = {
    workspaceId: params.workspaceId,
    title: params.title,
    period: params.period,
    from: window.from,
    to: window.to,
    brandIds: params.brandIds,
    snapshot,
    narrative,
    publicToken: generatePublicToken(),
    createdBy: params.createdBy,
    createdAt: nowIso,
    refreshedAt: nowIso,
    viewCount: 0,
  };

  await ref.set(report);
  return { id: ref.id, ...report };
}

export async function getReport(id: string): Promise<Report | null> {
  const snap = await adminDb().doc(`${COLLECTION}/${id}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Report;
}

/** Resolve a report by its public token — server-side only, for `/r/{token}`. */
export async function findReportByToken(token: string): Promise<Report | null> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("publicToken", "==", token)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...doc.data() } as Report;
}

export async function listReports(workspaceId: string): Promise<Report[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Report);
}

/**
 * Re-snapshot and re-narrate a report from current data. Idempotent: safe to run
 * on every view or on a schedule — it overwrites the snapshot in place and never
 * mints a new token or changes identity.
 */
export async function refreshReport(report: Report, now: Date): Promise<Report> {
  const window = resolvePeriod(report.period, now);
  const snapshot = await buildSnapshot(report.brandIds, window);
  const narrative = await generateNarrative(snapshot, PERIOD_LABELS[report.period]);

  const patch = {
    from: window.from,
    to: window.to,
    snapshot,
    narrative,
    refreshedAt: now.toISOString(),
  };
  await adminDb().doc(`${COLLECTION}/${report.id}`).update(patch);
  return { ...report, ...patch };
}

/** Count a public view. Atomic increment so concurrent views don't clobber. */
export async function recordView(id: string): Promise<void> {
  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({ viewCount: FieldValue.increment(1) });
}

export async function deleteReport(id: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).delete();
}

export async function setDigest(id: string, digest: ReportDigest | null): Promise<void> {
  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({ digest: digest ?? FieldValue.delete() });
}

/**
 * Reports whose weekly digest is due on `weekday` (0=Sun … 6=Sat). Drives the
 * digest cron. Requires the composite index on (digest.enabled, digest.weekday).
 */
export async function listReportsWithDigestDue(weekday: number): Promise<Report[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("digest.enabled", "==", true)
    .where("digest.weekday", "==", weekday)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Report);
}

/** Stamp a digest as sent, so a same-day cron re-run doesn't double-send. */
export async function markDigestSent(id: string, sentAtIso: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).update({ "digest.lastSentAt": sentAtIso });
}
