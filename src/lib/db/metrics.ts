import "server-only";

import { adminDb } from "../firebase-admin";
import type { Platform } from "@/types";
import type { MetricsDaily, PostMetrics } from "@/types/metrics";

/**
 * Metrics repositories — postMetrics and metricsDaily. Written by the sync
 * engine (Admin SDK); read by Analytics/Dashboard. Rules make both client
 * read-only, server-write-only.
 */

const POST_METRICS = "postMetrics";
const DAILY = "metricsDaily";

/** Deterministic ids so a re-sync overwrites rather than duplicates. */
const postMetricId = (postId: string, platform: Platform) => `${postId}_${platform}`;
const dailyId = (brandId: string, platform: Platform, date: string) =>
  `${brandId}_${platform}_${date}`;

export async function upsertPostMetrics(m: PostMetrics): Promise<void> {
  const clean = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined));
  await adminDb()
    .doc(`${POST_METRICS}/${postMetricId(m.postId, m.platform)}`)
    .set(clean);
}

export async function upsertDaily(d: MetricsDaily): Promise<void> {
  await adminDb()
    .doc(`${DAILY}/${dailyId(d.brandId, d.platform, d.date)}`)
    .set(d);
}

/** A brand's recent post metrics, newest first — analytics table + baselines. */
/**
 * The best intent score recorded for a post across its platforms, or null if it
 * hasn't been synced yet. Used by the autolist auto-retire check.
 */
export async function getPostIntentScore(postId: string): Promise<number | null> {
  const snap = await adminDb().collection(POST_METRICS).where("postId", "==", postId).get();
  if (snap.empty) return null;
  return Math.max(...snap.docs.map((d) => (d.data() as PostMetrics).intentScore));
}

export async function listPostMetrics(brandId: string, limit = 60): Promise<PostMetrics[]> {
  const snap = await adminDb()
    .collection(POST_METRICS)
    .where("brandId", "==", brandId)
    .orderBy("syncedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as PostMetrics);
}

/** Post metrics published within the trailing N days — for 90-day baselines. */
export async function listRecentPostMetrics(
  brandId: string,
  sinceIso: string,
): Promise<PostMetrics[]> {
  const snap = await adminDb()
    .collection(POST_METRICS)
    .where("brandId", "==", brandId)
    .where("syncedAt", ">=", sinceIso)
    .get();
  return snap.docs.map((d) => d.data() as PostMetrics);
}

/** Daily metrics for a brand+platform over a date range — analytics time series. */
export async function listDaily(
  brandId: string,
  platform: Platform,
  fromDate: string,
  toDate: string,
): Promise<MetricsDaily[]> {
  const snap = await adminDb()
    .collection(DAILY)
    .where("brandId", "==", brandId)
    .where("platform", "==", platform)
    .where("date", ">=", fromDate)
    .where("date", "<=", toDate)
    .get();
  return snap.docs
    .map((d) => d.data() as MetricsDaily)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** All of a brand's daily reach for a platform, most recent first — anomaly input. */
export async function listReachSeries(
  brandId: string,
  platform: Platform,
  days = 14,
): Promise<MetricsDaily[]> {
  const snap = await adminDb()
    .collection(DAILY)
    .where("brandId", "==", brandId)
    .where("platform", "==", platform)
    .orderBy("date", "desc")
    .limit(days)
    .get();
  // Return oldest → newest for the anomaly detector.
  return snap.docs.map((d) => d.data() as MetricsDaily).reverse();
}
