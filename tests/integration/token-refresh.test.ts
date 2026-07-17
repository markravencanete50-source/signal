import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Token-refresh engine integration test (Phase 7 hardening).
 *
 * Seeds three connections — one expiring inside the refresh window, one whose
 * token is unrecoverable and already past expiry, and one far from expiry — then
 * runs the real refresh engine against the MockAdapter and asserts: the first is
 * refreshed (new token, pushed-out expiry, still active), the second is marked
 * expired with an admin notification, and the third is left untouched (idempotent
 * — the cron only ever touches what's actually near expiry).
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
process.env.GROQ_API_KEY = "test";

const WS = "ws_tok";
const ADMIN = "user_admin_tok";

const { adminDb } = await import("../../src/lib/firebase-admin");
const { encryptToken } = await import("../../src/lib/crypto");
const { refreshExpiringTokens } = await import("../../src/lib/token-refresh");

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const base = {
  workspaceId: WS,
  pageId: "page_1",
  scopes: ["pages_manage_posts"],
  accountName: "Test Page",
  status: "active" as const,
};

beforeAll(async () => {
  const db = adminDb();

  await db.doc(`workspaces/${WS}/members/${ADMIN}`).set({ uid: ADMIN, role: "admin" });

  // Expiring within the 7-day window, with a valid encrypted token → refreshable.
  await db.doc(`connections/brand_soon_fb`).set({
    ...base,
    brandId: "brand_soon",
    platform: "fb",
    accessTokenEnc: encryptToken("valid-token"),
    tokenExpiresAt: daysFromNow(3),
  });

  // Past expiry with an unrecoverable token → should be marked expired + notify.
  await db.doc(`connections/brand_dead_fb`).set({
    ...base,
    brandId: "brand_dead",
    platform: "fb",
    accessTokenEnc: "not-valid-ciphertext",
    tokenExpiresAt: daysFromNow(-1),
  });

  // Far from expiry → outside the window, must be left alone.
  await db.doc(`connections/brand_fresh_fb`).set({
    ...base,
    brandId: "brand_fresh",
    platform: "fb",
    accessTokenEnc: encryptToken("still-good"),
    tokenExpiresAt: daysFromNow(40),
  });
});

afterAll(async () => {
  const db = adminDb();
  await Promise.all([
    db.doc(`connections/brand_soon_fb`).delete(),
    db.doc(`connections/brand_dead_fb`).delete(),
    db.doc(`connections/brand_fresh_fb`).delete(),
  ]);
});

describe("token-refresh engine", () => {
  it("refreshes the expiring token, expires the dead one, and skips the fresh one", async () => {
    const soonBefore = (await adminDb().doc("connections/brand_soon_fb").get()).data()!;
    const freshBefore = (await adminDb().doc("connections/brand_fresh_fb").get()).data()!;

    const result = await refreshExpiringTokens(new Date());

    // Only the two in-window connections were considered.
    expect(result.checked).toBe(2);
    expect(result.refreshed).toBe(1);
    expect(result.expired).toBe(1);

    const soon = (await adminDb().doc("connections/brand_soon_fb").get()).data()!;
    expect(soon.status).toBe("active");
    // Token rotated and expiry pushed out (~60 days for the mock).
    expect(soon.accessTokenEnc).not.toBe(soonBefore.accessTokenEnc);
    expect(new Date(soon.tokenExpiresAt).getTime()).toBeGreaterThan(
      new Date(soonBefore.tokenExpiresAt).getTime(),
    );

    const dead = (await adminDb().doc("connections/brand_dead_fb").get()).data()!;
    expect(dead.status).toBe("expired");

    const fresh = (await adminDb().doc("connections/brand_fresh_fb").get()).data()!;
    expect(fresh.status).toBe("active");
    // Untouched: far from expiry, so the engine never looked at it.
    expect(fresh.tokenExpiresAt).toBe(freshBefore.tokenExpiresAt);
    expect(fresh.accessTokenEnc).toBe(freshBefore.accessTokenEnc);

    // The dead connection nudged the workspace admin to reconnect.
    const notes = await adminDb().collection("notifications").where("userId", "==", ADMIN).get();
    expect(notes.size).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent — a second run has nothing in the window to refresh", async () => {
    // The dead one is now expired (not active) and the soon one is 60 days out,
    // so a re-run finds only whatever is still active-and-near-expiry: nothing.
    const result = await refreshExpiringTokens(new Date());
    expect(result.refreshed).toBe(0);
    expect(result.expired).toBe(0);
  });
});
