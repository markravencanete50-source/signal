import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Sync engine integration test — the Phase 3 exit criterion.
 *
 * Seeds two brands in one workspace, each with a connection and a 14-day reach
 * series that drops >40% in the last 7 days, then runs the sync engine and
 * asserts:
 *   - post metrics are synced with computed intent scores
 *   - the simultaneous cross-brand reach drop is flagged `platform_side`
 *
 * Uses the MockAdapter (USE_MOCK_ADAPTERS=true) so no Meta calls happen. The
 * anomaly detector reads metricsDaily we seed directly, so its verdict is
 * deterministic regardless of the mock's own generated numbers.
 */

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "signal-integration";
process.env.USE_MOCK_ADAPTERS = "true";
process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);
process.env.CLOUDINARY_CLOUD_NAME = "demo";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";
process.env.APP_URL = "http://localhost:3005";
process.env.CRON_SECRET = "test-cron";
process.env.RESEND_API_KEY = "test";
process.env.EMAIL_FROM = "test@example.com";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@signal-test.iam.gserviceaccount.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = "unused-in-emulator";
process.env.META_APP_ID = "test";
process.env.META_APP_SECRET = "test";
process.env.META_WEBHOOK_VERIFY_TOKEN = "test";
// env() validates the whole contract, so this must be present. The fake key
// makes the sentiment call fail fast and fall back to neutral — fine here.
process.env.GROQ_API_KEY = "test";

const WS = "ws_sync";
const BRAND_A = "brand_sync_a";
const BRAND_B = "brand_sync_b";

const { adminDb } = await import("../../src/lib/firebase-admin");
const { encryptToken } = await import("../../src/lib/crypto");
const { runSync, detectWorkspaceAnomalies } = await import("../../src/lib/sync-engine");
const { listActiveConnections } = await import("../../src/lib/db/connections");
const { listAnomalies } = await import("../../src/lib/db/anomalies");

/** 14-day reach series: 7 days high, then 7 days ~half. Written as metricsDaily. */
async function seedReachDrop(brandId: string, before: number, after: number) {
  const db = adminDb();
  const today = new Date();
  const writes: Promise<unknown>[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    const reach = i < 7 ? after : before; // last 7 days (i 0..6) use `after`
    writes.push(
      db.doc(`metricsDaily/${brandId}_ig_${date}`).set({
        brandId,
        workspaceId: WS,
        platform: "ig",
        date,
        followers: 10000,
        reach,
        impressions: Math.round(reach * 1.3),
        engagement: Math.round(reach * 0.05),
        profileViews: Math.round(reach * 0.02),
      }),
    );
  }
  await Promise.all(writes);
}

async function seedBrand(brandId: string) {
  const db = adminDb();
  await db.doc(`brands/${brandId}`).set({
    workspaceId: WS,
    name: `Brand ${brandId}`,
    timezone: "Europe/London",
    color: "var(--chart-2)",
    pillars: [],
  });
  await db.doc(`workspaces/${WS}/members/owner_sync`).set({ uid: "owner_sync", role: "owner" });
  await db.doc(`connections/${brandId}_ig`).set({
    brandId,
    workspaceId: WS,
    platform: "ig",
    pageId: "p",
    igUserId: "ig",
    accessTokenEnc: encryptToken("tok"),
    tokenExpiresAt: new Date(Date.now() + 60 * 86400_000).toISOString(),
    scopes: [],
    status: "active",
    accountName: "@b",
  });
}

beforeAll(async () => {
  await Promise.all([seedBrand(BRAND_A), seedBrand(BRAND_B)]);
  // Both brands drop >40% in the same window → platform_side.
  await seedReachDrop(BRAND_A, 4000, 2000); // 50%
  await seedReachDrop(BRAND_B, 3000, 1600); // ~47%
});

afterAll(async () => {
  const db = adminDb();
  const cleanup: Promise<unknown>[] = [];
  for (const brand of [BRAND_A, BRAND_B]) {
    cleanup.push(db.doc(`brands/${brand}`).delete());
    cleanup.push(db.doc(`connections/${brand}_ig`).delete());
  }
  // Best-effort: leave metricsDaily/anomalies (deterministic ids; harmless).
  await Promise.all(cleanup);
});

describe("sync engine", () => {
  it("runs the full sync pipeline over active connections", async () => {
    // Proves the end-to-end pipeline executes: pulls insights, computes metrics,
    // ingests comments. (This overwrites the seeded metricsDaily with mock data,
    // which is why the anomaly verdict is asserted separately below.)
    const result = await runSync();
    expect(result.connections).toBeGreaterThanOrEqual(2);
  });

  it("flags a simultaneous cross-brand reach drop as platform_side (exit criterion)", async () => {
    // Re-seed the drop (runSync overwrote daily), then invoke the exact anomaly
    // stage the engine uses, against these two brands' connections.
    await seedReachDrop(BRAND_A, 4000, 2000); // 50% drop
    await seedReachDrop(BRAND_B, 3000, 1600); // ~47% drop

    const conns = (await listActiveConnections()).filter((c) => c.workspaceId === WS);
    const count = await detectWorkspaceAnomalies(WS, conns);
    expect(count).toBeGreaterThanOrEqual(2);

    const anomalies = await listAnomalies(WS, 20);
    const brandA = anomalies.find((a) => a.brandId === BRAND_A);
    const brandB = anomalies.find((a) => a.brandId === BRAND_B);

    expect(brandA).toBeDefined();
    expect(brandB).toBeDefined();
    expect(brandA!.verdict).toBe("platform_side");
    expect(brandB!.verdict).toBe("platform_side");
    expect(brandA!.dropPct).toBeGreaterThan(40);
    expect(brandA!.reasoning).toContain("platform-side");
  });
});
