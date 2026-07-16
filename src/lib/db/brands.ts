import "server-only";

import type { Brand, Pillar } from "@/types";

import { adminDb } from "../firebase-admin";

/** Brands repository. */

const COLLECTION = "brands";

/**
 * Starter content pillars for a new brand.
 *
 * Seeded rather than left empty because Studio's pillar-balance bar compares
 * actual vs target — with no pillars it has nothing to say, and the brand looks
 * broken on day one. Colours are chart tokens so they flip with the theme.
 */
const DEFAULT_PILLARS: Pillar[] = [
  { name: "Listings", color: "var(--chart-1)", targetPct: 40 },
  { name: "Education", color: "var(--chart-2)", targetPct: 30 },
  { name: "Market data", color: "var(--chart-3)", targetPct: 20 },
  { name: "Team & culture", color: "var(--chart-4)", targetPct: 10 },
];

export async function getBrand(id: string): Promise<Brand | null> {
  const snap = await adminDb().doc(`${COLLECTION}/${id}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Brand;
}

export async function listBrands(workspaceId: string): Promise<Brand[]> {
  const snap = await adminDb().collection(COLLECTION).where("workspaceId", "==", workspaceId).get();

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Brand)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createBrand(params: {
  workspaceId: string;
  name: string;
  timezone?: string;
  color?: string;
  logoUrl?: string;
}): Promise<Brand> {
  const ref = adminDb().collection(COLLECTION).doc();

  const brand: Omit<Brand, "id"> = {
    workspaceId: params.workspaceId,
    name: params.name,
    // Every schedule and best-time calculation resolves against this, so a
    // wrong default silently posts at the wrong hour. Europe/London matches the
    // current customer base; surfaced in the UI so it can be corrected.
    timezone: params.timezone ?? "Europe/London",
    color: params.color ?? "var(--chart-2)",
    pillars: DEFAULT_PILLARS,
    ...(params.logoUrl ? { logoUrl: params.logoUrl } : {}),
  };

  await ref.set(brand);
  return { id: ref.id, ...brand };
}

export async function updateBrand(
  id: string,
  patch: Partial<Pick<Brand, "name" | "timezone" | "color" | "logoUrl" | "pillars">>,
): Promise<void> {
  // workspaceId is deliberately not patchable — moving a brand between tenants
  // would orphan its posts, metrics and connections.
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) return;
  await adminDb().doc(`${COLLECTION}/${id}`).update(clean);
}

/**
 * Delete a brand and everything scoped to it.
 *
 * Firestore does not cascade. Leaving connections behind is a *security*
 * problem, not just clutter: the publish and sync crons query by connection,
 * not by brand, so an orphaned connection keeps holding a live Meta token and
 * keeps being used against an account the user believes they disconnected.
 *
 * Uses BulkWriter rather than a batch: `WriteBatch` caps at 500 operations, and
 * a brand with a few hundred posts plus metrics would silently exceed it. Bulk-
 * Writer chunks and retries for us.
 */
export async function deleteBrand(id: string): Promise<void> {
  const db = adminDb();
  const writer = db.bulkWriter();

  const scoped = ["connections", "posts", "autolists", "smartlinks", "competitors", "inboxItems"];

  for (const collection of scoped) {
    const snap = await db.collection(collection).where("brandId", "==", id).get();
    for (const doc of snap.docs) void writer.delete(doc.ref);
  }

  void writer.delete(db.doc(`${COLLECTION}/${id}`));

  await writer.close();
}
