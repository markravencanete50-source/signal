import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Firestore security rules tests.
 *
 * These are the last line of defence for tenant isolation, so they assert the
 * things that would be catastrophic if wrong:
 *   - platform tokens are unreachable from any client
 *   - workspace A can never see workspace B
 *   - the `client` role cannot write content or escalate itself
 *
 * Run: npm run test:rules   (boots the Firestore emulator via firebase CLI)
 */

const WS_A = "ws_alpha";
const WS_B = "ws_beta";

const OWNER_A = "user_owner_a";
const EDITOR_A = "user_editor_a";
const CLIENT_A = "user_client_a";
const OWNER_B = "user_owner_b";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "signal-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Seed via withSecurityRulesDisabled — this is the Admin SDK equivalent, and
  // mirrors reality: memberships and connections are provisioned server-side.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await db.doc(`workspaces/${WS_A}`).set({
      name: "Alpha Agency",
      ownerId: OWNER_A,
      plan: "free",
      settings: { aiQuota: 1000 },
    });
    await db.doc(`workspaces/${WS_A}/members/${OWNER_A}`).set({ uid: OWNER_A, role: "owner" });
    await db.doc(`workspaces/${WS_A}/members/${EDITOR_A}`).set({ uid: EDITOR_A, role: "editor" });
    await db.doc(`workspaces/${WS_A}/members/${CLIENT_A}`).set({ uid: CLIENT_A, role: "client" });

    await db.doc(`workspaces/${WS_B}`).set({ name: "Beta Agency", ownerId: OWNER_B });
    await db.doc(`workspaces/${WS_B}/members/${OWNER_B}`).set({ uid: OWNER_B, role: "owner" });

    await db.doc(`brands/brand_a`).set({ workspaceId: WS_A, name: "House of Lettings" });
    await db.doc(`brands/brand_b`).set({ workspaceId: WS_B, name: "Someone Else" });

    await db.doc(`connections/conn_a`).set({
      brandId: "brand_a",
      workspaceId: WS_A,
      platform: "fb",
      accessTokenEnc: "encrypted-blob",
    });

    await db.doc(`invites/invite_a`).set({
      workspaceId: WS_A,
      email: "invitee@example.com",
      role: "editor",
      token: "secret-bearer-token",
    });

    await db.doc(`reports/report_a`).set({
      workspaceId: WS_A,
      title: "June 2026",
      publicToken: "secret-report-token",
    });

    await db.doc(`smartlinks/sl_a`).set({
      workspaceId: WS_A,
      brandId: "brand_a",
      slug: "house-of-lettings",
      totalClicks: 42,
    });

    await db.doc(`smartlinkClicks/post_pending`).set({
      workspaceId: WS_A,
      brandId: "brand_a",
      postId: "post_pending",
      clicks: 7,
    });

    await db.doc(`metaDeletionRequests/code_a`).set({
      code: "code_a",
      metaUserId: "meta_user_1",
      status: "completed",
    });

    await db.doc(`autolists/al_a`).set({
      workspaceId: WS_A,
      brandId: "brand_a",
      name: "Evergreen tips",
      enabled: true,
    });

    await db.doc(`competitors/comp_a`).set({
      workspaceId: WS_A,
      brandId: "brand_a",
      handle: "@rival",
    });
    await db.doc(`competitors/comp_a/snapshots/2026-07-17`).set({
      date: "2026-07-17",
      followers: 1000,
    });

    await db.doc(`posts/post_pending`).set({
      workspaceId: WS_A,
      brandId: "brand_a",
      status: "pending_approval",
      variants: { facebook: { caption: "original caption" } },
      approval: { required: true, requestedFrom: CLIENT_A },
    });

    await db.doc(`posts/post_b`).set({
      workspaceId: WS_B,
      brandId: "brand_b",
      status: "draft",
    });

    await db.doc(`auditLogs/log_1`).set({ workspaceId: WS_A, action: "post.delete" });
    await db.doc(`postMetrics/post_pending_facebook`).set({
      workspaceId: WS_A,
      brandId: "brand_a",
      intentScore: 74,
    });
  });
});

const asOwnerA = () => testEnv.authenticatedContext(OWNER_A).firestore();
const asEditorA = () => testEnv.authenticatedContext(EDITOR_A).firestore();
const asClientA = () => testEnv.authenticatedContext(CLIENT_A).firestore();
const asOwnerB = () => testEnv.authenticatedContext(OWNER_B).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

describe("connections — platform tokens", () => {
  it("denies reads to an owner of the owning workspace", async () => {
    // Not a typo: NOBODY reads this from a client, however privileged.
    await assertFails(asOwnerA().doc("connections/conn_a").get());
  });

  it("denies reads to anonymous users", async () => {
    await assertFails(asAnon().doc("connections/conn_a").get());
  });

  it("denies writes to an owner", async () => {
    await assertFails(asOwnerA().doc("connections/conn_a").set({ accessTokenEnc: "mine now" }));
  });

  it("denies listing the collection", async () => {
    await assertFails(asOwnerA().collection("connections").get());
  });
});

describe("invites — bearer tokens", () => {
  it("denies an owner reading an invite (token would leak)", async () => {
    await assertFails(asOwnerA().doc("invites/invite_a").get());
  });

  it("denies enumerating the invites collection", async () => {
    await assertFails(asOwnerA().collection("invites").get());
  });

  it("denies writing an invite from the client", async () => {
    await assertFails(
      asOwnerA().doc("invites/forged").set({ workspaceId: WS_A, role: "owner", token: "mine" }),
    );
  });
});

describe("reports — public bearer tokens", () => {
  it("denies an owner reading a report (public token would leak)", async () => {
    await assertFails(asOwnerA().doc("reports/report_a").get());
  });

  it("denies enumerating the reports collection", async () => {
    await assertFails(asOwnerA().collection("reports").get());
  });

  it("denies writing a report from the client", async () => {
    await assertFails(
      asOwnerA().doc("reports/forged").set({ workspaceId: WS_A, publicToken: "mine" }),
    );
  });
});

describe("smartlinks — public link-in-bio", () => {
  it("denies an owner reading a smartlink (counts must move server-side)", async () => {
    await assertFails(asOwnerA().doc("smartlinks/sl_a").get());
  });

  it("denies a client inflating a click counter", async () => {
    await assertFails(asOwnerA().doc("smartlinks/sl_a").update({ totalClicks: 999_999 }));
  });

  it("denies reading or writing click attribution", async () => {
    await assertFails(asOwnerA().doc("smartlinkClicks/post_pending").get());
    await assertFails(asOwnerA().doc("smartlinkClicks/post_pending").update({ clicks: 999 }));
  });
});

describe("metaDeletionRequests — deletion log", () => {
  it("denies an owner reading a deletion request (Admin-SDK only)", async () => {
    await assertFails(asOwnerA().doc("metaDeletionRequests/code_a").get());
  });

  it("denies any client write", async () => {
    await assertFails(
      asOwnerA().doc("metaDeletionRequests/forged").set({ code: "forged", metaUserId: "x" }),
    );
  });
});

describe("autolists — workspace content", () => {
  it("lets a member read their workspace's autolist", async () => {
    await assertSucceeds(asOwnerA().doc("autolists/al_a").get());
  });

  it("denies reading another workspace's autolist", async () => {
    await assertFails(asOwnerB().doc("autolists/al_a").get());
  });

  it("denies a client (read-only) creating an autolist", async () => {
    await assertFails(
      asClientA().doc("autolists/forged").set({ workspaceId: WS_A, brandId: "brand_a" }),
    );
  });
});

describe("competitors — public-data tracking", () => {
  it("lets a member read a tracked competitor", async () => {
    await assertSucceeds(asOwnerA().doc("competitors/comp_a").get());
  });

  it("denies cross-workspace reads", async () => {
    await assertFails(asOwnerB().doc("competitors/comp_a").get());
  });

  it("denies client writes to snapshots (cron-only)", async () => {
    await assertFails(
      asOwnerA()
        .doc("competitors/comp_a/snapshots/2026-07-18")
        .set({ date: "2026-07-18", followers: 1 }),
    );
  });
});

describe("workspace billing fields — server-write-only", () => {
  it("lets an owner rename the workspace", async () => {
    await assertSucceeds(asOwnerA().doc(`workspaces/${WS_A}`).update({ name: "Renamed" }));
  });

  it("denies a self-upgrade to Pro from the client", async () => {
    await assertFails(asOwnerA().doc(`workspaces/${WS_A}`).update({ plan: "pro" }));
  });

  it("denies forging a Stripe customer id", async () => {
    await assertFails(
      asOwnerA().doc(`workspaces/${WS_A}`).update({ stripeCustomerId: "cus_forged" }),
    );
  });

  it("denies forging a subscription status", async () => {
    await assertFails(
      asOwnerA().doc(`workspaces/${WS_A}`).update({ subscriptionStatus: "active" }),
    );
  });
});

describe("cross-workspace isolation", () => {
  it("denies reading another workspace's brand", async () => {
    await assertFails(asOwnerA().doc("brands/brand_b").get());
  });

  it("denies reading another workspace's post", async () => {
    await assertFails(asOwnerA().doc("posts/post_b").get());
  });

  it("denies writing another workspace's post", async () => {
    await assertFails(asOwnerB().doc("posts/post_pending").update({ status: "draft" }));
  });

  it("denies reading another workspace's document", async () => {
    await assertFails(asOwnerA().doc(`workspaces/${WS_B}`).get());
  });

  it("allows reading your own workspace's brand", async () => {
    await assertSucceeds(asOwnerA().doc("brands/brand_a").get());
  });

  it("denies moving a post into another workspace", async () => {
    await assertFails(asOwnerA().doc("posts/post_pending").update({ workspaceId: WS_B }));
  });
});

describe("client role — read-only plus approve/reject", () => {
  it("allows reading brands", async () => {
    await assertSucceeds(asClientA().doc("brands/brand_a").get());
  });

  it("denies creating a post", async () => {
    await assertFails(
      asClientA()
        .doc("posts/new_post")
        .set({ workspaceId: WS_A, brandId: "brand_a", status: "draft" }),
    );
  });

  it("denies deleting a post", async () => {
    await assertFails(asClientA().doc("posts/post_pending").delete());
  });

  it("denies editing a brand", async () => {
    await assertFails(asClientA().doc("brands/brand_a").update({ name: "Renamed" }));
  });

  it("allows approving a post awaiting their decision", async () => {
    await assertSucceeds(
      asClientA()
        .doc("posts/post_pending")
        .update({
          status: "approved",
          approval: { required: true, decidedBy: CLIENT_A, note: "Looks great" },
        }),
    );
  });

  it("denies smuggling a caption edit alongside an approval", async () => {
    await assertFails(
      asClientA()
        .doc("posts/post_pending")
        .update({
          status: "approved",
          approval: { decidedBy: CLIENT_A },
          variants: { facebook: { caption: "hijacked" } },
        }),
    );
  });

  it("denies approving straight to published", async () => {
    await assertFails(
      asClientA()
        .doc("posts/post_pending")
        .update({
          status: "published",
          approval: { decidedBy: CLIENT_A },
        }),
    );
  });
});

describe("editor role", () => {
  it("allows creating a post in their workspace", async () => {
    await assertSucceeds(
      asEditorA()
        .doc("posts/new_post")
        .set({ workspaceId: WS_A, brandId: "brand_a", status: "draft" }),
    );
  });

  it("denies creating a post in another workspace", async () => {
    await assertFails(
      asEditorA()
        .doc("posts/new_post")
        .set({ workspaceId: WS_B, brandId: "brand_b", status: "draft" }),
    );
  });

  it("denies managing members", async () => {
    await assertFails(
      asEditorA()
        .doc(`workspaces/${WS_A}/members/someone_new`)
        .set({ uid: "someone_new", role: "editor" }),
    );
  });
});

describe("privilege escalation", () => {
  it("denies a client promoting themselves to owner", async () => {
    await assertFails(
      asClientA().doc(`workspaces/${WS_A}/members/${CLIENT_A}`).update({ role: "owner" }),
    );
  });

  it("denies an owner silently rewriting their own role", async () => {
    await assertFails(
      asOwnerA().doc(`workspaces/${WS_A}/members/${OWNER_A}`).update({ role: "client" }),
    );
  });

  it("allows an owner to invite a new member", async () => {
    await assertSucceeds(
      asOwnerA()
        .doc(`workspaces/${WS_A}/members/user_new`)
        .set({ uid: "user_new", role: "editor" }),
    );
  });

  it("denies a member doc whose uid field doesn't match its id", async () => {
    // A forged uid would make this workspace appear in OWNER_B's collection-group
    // lookup — i.e. inject a tenant into someone else's brand switcher.
    await assertFails(
      asOwnerA().doc(`workspaces/${WS_A}/members/user_new`).set({ uid: OWNER_B, role: "editor" }),
    );
  });

  it("denies transferring workspace ownership by field edit", async () => {
    await assertFails(asOwnerA().doc(`workspaces/${WS_A}`).update({ ownerId: EDITOR_A }));
  });
});

describe("server-owned collections", () => {
  it("denies client writes to postMetrics", async () => {
    await assertFails(
      asOwnerA().doc("postMetrics/post_pending_facebook").update({ intentScore: 100 }),
    );
  });

  it("allows members to read postMetrics", async () => {
    await assertSucceeds(asOwnerA().doc("postMetrics/post_pending_facebook").get());
  });

  it("denies tampering with auditLogs", async () => {
    await assertFails(asOwnerA().doc("auditLogs/log_1").update({ action: "nothing to see" }));
  });

  it("denies deleting auditLogs", async () => {
    await assertFails(asOwnerA().doc("auditLogs/log_1").delete());
  });

  it("lets an admin read the workspace's auditLogs", async () => {
    await assertSucceeds(asOwnerA().doc("auditLogs/log_1").get());
  });

  it("denies a non-admin (editor) reading auditLogs", async () => {
    await assertFails(asEditorA().doc("auditLogs/log_1").get());
  });

  it("denies cross-workspace auditLog reads", async () => {
    await assertFails(asOwnerB().doc("auditLogs/log_1").get());
  });

  it("denies client-side workspace creation", async () => {
    // Must be server-side: workspace + owner member doc have to land atomically.
    await assertFails(
      asOwnerA().doc("workspaces/ws_new").set({ name: "Sneaky", ownerId: OWNER_A }),
    );
  });
});

describe("anonymous access", () => {
  it("denies reading brands", async () => {
    await assertFails(asAnon().doc("brands/brand_a").get());
  });

  it("denies reading posts", async () => {
    await assertFails(asAnon().doc("posts/post_pending").get());
  });
});
