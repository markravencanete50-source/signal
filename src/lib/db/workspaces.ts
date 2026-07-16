import "server-only";

import {
  DEFAULT_WORKSPACE_SETTINGS,
  type Member,
  type Role,
  type TeamMember,
  type User,
  type Workspace,
} from "@/types";

import { adminDb } from "../firebase-admin";

/**
 * Workspaces + members repository.
 *
 * Workspace creation is server-side ONLY (firestore.rules sets
 * `allow create: if false`). The reason is structural, not preference: the
 * client-side rule for adding a member requires the caller to already be an
 * admin — which is read from the very member doc being created. A browser
 * therefore cannot bootstrap itself without stranding a workspace that has no
 * members and can never be administered. See DECISIONS #005.
 */

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const snap = await adminDb().doc(`workspaces/${id}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Workspace;
}

/**
 * Create a workspace and install its owner atomically.
 *
 * A batch, not two writes: a crash between them would leave exactly the orphan
 * state the rules are designed to prevent.
 */
export async function createWorkspace(params: {
  name: string;
  ownerId: string;
}): Promise<Workspace> {
  const db = adminDb();
  const ref = db.collection("workspaces").doc();
  const now = new Date().toISOString();

  const workspace: Omit<Workspace, "id"> = {
    name: params.name,
    ownerId: params.ownerId,
    plan: "free",
    settings: DEFAULT_WORKSPACE_SETTINGS,
    createdAt: now,
  };

  const batch = db.batch();
  batch.set(ref, workspace);
  batch.set(ref.collection("members").doc(params.ownerId), {
    // `uid` duplicates the doc id on purpose — see listWorkspacesForUser().
    uid: params.ownerId,
    role: "owner" satisfies Role,
    joinedAt: now,
  });
  // Make it the user's default so the next sign-in lands somewhere real.
  batch.set(db.doc(`users/${params.ownerId}`), { defaultWorkspaceId: ref.id }, { merge: true });

  await batch.commit();

  return { id: ref.id, ...workspace };
}

/**
 * Find the workspace a Stripe customer belongs to — the webhook's lookup. The
 * customer id is denormalised onto the workspace at checkout, so this is a single
 * indexed query.
 */
export async function getWorkspaceByStripeCustomer(customerId: string): Promise<Workspace | null> {
  const snap = await adminDb()
    .collection("workspaces")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...doc.data() } as Workspace;
}

/**
 * Persist billing state. Written ONLY server-side — from checkout (customer id)
 * and the Stripe webhook (plan/status). Firestore rules forbid clients touching
 * these fields, so this Admin-SDK path is the sole writer.
 */
export async function setWorkspaceBilling(
  workspaceId: string,
  billing: Partial<
    Pick<
      Workspace,
      | "plan"
      | "stripeCustomerId"
      | "stripeSubscriptionId"
      | "subscriptionStatus"
      | "currentPeriodEnd"
    >
  >,
): Promise<void> {
  const clean = Object.fromEntries(Object.entries(billing).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) return;
  await adminDb().doc(`workspaces/${workspaceId}`).update(clean);
}

/** A user's display label (name → email → uid), for audit targets and the like. */
export async function getUserLabel(uid: string): Promise<string> {
  const snap = await adminDb().doc(`users/${uid}`).get();
  const data = snap.exists ? (snap.data() as User) : null;
  return data?.name || data?.email || uid;
}

export async function getMember(workspaceId: string, uid: string): Promise<Member | null> {
  const snap = await adminDb().doc(`workspaces/${workspaceId}/members/${uid}`).get();
  if (!snap.exists) return null;
  return { uid: snap.id, ...snap.data() } as Member;
}

export async function addMember(workspaceId: string, uid: string, role: Role): Promise<void> {
  await adminDb()
    .doc(`workspaces/${workspaceId}/members/${uid}`)
    .set({ uid, role, joinedAt: new Date().toISOString() });
}

export async function updateMemberRole(
  workspaceId: string,
  uid: string,
  role: Role,
): Promise<void> {
  await adminDb().doc(`workspaces/${workspaceId}/members/${uid}`).update({ role });
}

export async function removeMember(workspaceId: string, uid: string): Promise<void> {
  await adminDb().doc(`workspaces/${workspaceId}/members/${uid}`).delete();
}

/**
 * Members joined with their user profiles, for Settings → Team.
 *
 * Firestore has no joins, so this is an N+1 by necessity. Bounded by team size
 * (tens, not thousands) and fetched in parallel, so it stays a single round-trip
 * of latency rather than N sequential ones.
 */
export async function listTeamMembers(workspaceId: string): Promise<TeamMember[]> {
  const memberSnap = await adminDb().collection(`workspaces/${workspaceId}/members`).get();

  const members = await Promise.all(
    memberSnap.docs.map(async (doc) => {
      const { role, joinedAt } = doc.data() as Omit<Member, "uid">;
      const userSnap = await adminDb().doc(`users/${doc.id}`).get();
      const user = userSnap.exists ? (userSnap.data() as User) : null;

      return {
        uid: doc.id,
        role,
        joinedAt,
        // An invited user who hasn't signed up yet has no profile doc.
        name: user?.name ?? "Invited user",
        email: user?.email ?? "",
        avatarUrl: user?.avatarUrl,
      } satisfies TeamMember;
    }),
  );

  const order: Record<Role, number> = { owner: 0, admin: 1, editor: 2, client: 3 };
  return members.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
}

/**
 * Every workspace a user belongs to.
 *
 * Collection-group query filtered on the `uid` FIELD, which is why member docs
 * store their uid even though it duplicates the document id. Firestore cannot
 * filter a collection-group query by document id (`__name__` there means the
 * full path), so the alternative is fetching every member doc of every tenant
 * and filtering in memory — O(all customers) per page load, and billed per read.
 *
 * Requires the COLLECTION_GROUP index on `members.uid` in firestore.indexes.json.
 */
export async function listWorkspacesForUser(uid: string): Promise<Workspace[]> {
  const snap = await adminDb().collectionGroup("members").where("uid", "==", uid).get();

  const ids = snap.docs
    .map((d) => d.ref.parent.parent?.id)
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return [];

  const workspaces = await Promise.all(ids.map((id) => getWorkspace(id)));
  return workspaces.filter((w): w is Workspace => w !== null);
}

export async function upsertUser(user: {
  uid: string;
  email: string;
  name: string;
  avatarUrl?: string;
}): Promise<void> {
  const ref = adminDb().doc(`users/${user.uid}`);
  const existing = await ref.get();

  if (existing.exists) {
    // Refresh mutable profile fields on each sign-in, but never clobber
    // createdAt or defaultWorkspaceId.
    await ref.set(
      { email: user.email, name: user.name, avatarUrl: user.avatarUrl ?? null },
      { merge: true },
    );
    return;
  }

  await ref.set({
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: new Date().toISOString(),
  });
}
