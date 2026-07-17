import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Publish engine integration test — the Phase 2 exit criterion.
 *
 * Seeds a due scheduled post (with a connection and a media asset) into the
 * Firestore emulator, then runs the real publish pipeline against the
 * MockAdapter and asserts the post publishes with a permalink, and that the
 * claim lock prevents a double-publish.
 *
 * Env is set here (not a shared setup file) so the test is self-describing:
 * emulator host, mock adapters on, and a valid 32-byte token key.
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
// env() validates the whole server contract at once, so the mock-mode publish
// path still needs these present (unused under USE_MOCK_ADAPTERS).
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@signal-test.iam.gserviceaccount.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = "unused-in-emulator";
process.env.META_APP_ID = "test";
process.env.META_APP_SECRET = "test";
process.env.META_WEBHOOK_VERIFY_TOKEN = "test";
process.env.GROQ_API_KEY = "test";

const BRAND = "brand_pub";
const WS = "ws_pub";

// Imported after env is set so module-load-time reads see the emulator config.
const { adminDb } = await import("../../src/lib/firebase-admin");
const { encryptToken } = await import("../../src/lib/crypto");
const { claimDuePosts, getPost } = await import("../../src/lib/db/posts");
const { publishPost } = await import("../../src/lib/publish-engine");

beforeAll(async () => {
  const db = adminDb();

  await db.doc(`brands/${BRAND}`).set({
    workspaceId: WS,
    name: "Publish Test Brand",
    timezone: "Europe/London",
    color: "var(--chart-2)",
    pillars: [],
  });

  await db.doc(`connections/${BRAND}_ig`).set({
    brandId: BRAND,
    workspaceId: WS,
    platform: "ig",
    pageId: "page_1",
    igUserId: "ig_1",
    accessTokenEnc: encryptToken("fake-token"),
    tokenExpiresAt: new Date(Date.now() + 60 * 86400_000).toISOString(),
    scopes: ["instagram_content_publish"],
    status: "active",
    accountName: "@testbrand",
  });

  await db.doc(`mediaAssets/asset_1`).set({
    workspaceId: WS,
    cloudinaryPublicId: "signal/ws_pub/photo",
    type: "image",
    format: "jpg",
    width: 1080,
    height: 1350,
    bytes: 500_000,
    tags: [],
    folder: `signal/${WS}`,
    uploadedBy: "u1",
    createdAt: new Date().toISOString(),
    usage: [],
    secureUrl: "https://res.cloudinary.com/demo/image/upload/signal/ws_pub/photo.jpg",
  });

  // A post due one minute ago, so claimDuePosts picks it up.
  await db.doc(`posts/post_due`).set({
    brandId: BRAND,
    workspaceId: WS,
    createdBy: "u1",
    status: "scheduled",
    scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    attempts: 0,
    variants: {
      instagram: { caption: "Integration test post", mediaAssetIds: ["asset_1"] },
    },
  });
});

afterAll(async () => {
  const db = adminDb();
  await Promise.all([
    db.doc(`brands/${BRAND}`).delete(),
    db.doc(`connections/${BRAND}_ig`).delete(),
    db.doc(`mediaAssets/asset_1`).delete(),
    db.doc(`posts/post_due`).delete(),
  ]);
});

describe("publish engine", () => {
  it("claims, publishes, and records a permalink", async () => {
    const claimed = await claimDuePosts(new Date().toISOString(), 20);

    // The due post is claimed and flipped to publishing (attempts incremented).
    const target = claimed.find((p) => p.id === "post_due");
    expect(target).toBeDefined();
    expect(target!.status).toBe("publishing");
    expect(target!.attempts).toBe(1);

    await publishPost(target!);

    const after = await getPost("post_due");
    expect(after!.status).toBe("published");
    expect(after!.publishedAt).toBeDefined();
    expect(after!.results?.instagram?.permalink).toMatch(/instagram\.com/);
    expect(after!.results?.instagram?.externalId).toBeDefined();
  });

  it("does not re-claim an already-claimed post (idempotent lock)", async () => {
    // Second claim after the post is published: it must not be returned again.
    const claimedAgain = await claimDuePosts(new Date().toISOString(), 20);
    expect(claimedAgain.find((p) => p.id === "post_due")).toBeUndefined();
  });
});
