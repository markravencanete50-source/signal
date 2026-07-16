import "server-only";

import { generatePublicToken } from "../crypto";
import { adminDb } from "../firebase-admin";
import type { Post, PostStatus } from "@/types";

/**
 * Approvals — the client one-click flow, built on the post's `approval` block.
 *
 * The approval token is a bearer credential in an email link: whoever holds it
 * can approve/reject WITHOUT logging in. So it's 32 crypto-random bytes, stored
 * on the post, and single-use (cleared on decision). Looked up only via the
 * Admin SDK server-side — never a public Firestore read (DECISIONS #006).
 */

const COLLECTION = "posts";

/**
 * Attach a fresh approval token to a post and set it awaiting approval.
 *
 * Returns the token so the caller can build the email links. Regenerating on
 * each request means an old, forwarded link stops working once a new request is
 * sent — the token is the gate.
 */
export async function requestApproval(postId: string, requestedFrom: string): Promise<string> {
  const token = generatePublicToken();
  await adminDb()
    .doc(`${COLLECTION}/${postId}`)
    .update({
      status: "pending_approval" satisfies PostStatus,
      approval: { required: true, requestedFrom, approvalToken: token },
    });
  return token;
}

/** Find the post a token belongs to. Server-side only; the token isn't queryable by clients. */
export async function findPostByApprovalToken(token: string): Promise<Post | null> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("approval.approvalToken", "==", token)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...doc.data() } as Post;
}

export type ApprovalDecision = "approved" | "rejected";

/**
 * Record a client's decision and move the post accordingly.
 *
 * Approve → the post becomes `scheduled` if it had a time, else `draft` (a team
 * member schedules it). Reject → back to `draft` for revision. Either way the
 * token is cleared so the link can't be reused, and `decidedBy`/`decidedAt`/
 * `note` are recorded for the audit trail and the requester's notification.
 */
export async function recordDecision(
  post: Post,
  decision: ApprovalDecision,
  note: string,
  decidedByLabel: string,
): Promise<PostStatus> {
  const nextStatus: PostStatus =
    decision === "approved" ? (post.scheduledAt ? "scheduled" : "draft") : "draft";

  await adminDb()
    .doc(`${COLLECTION}/${post.id}`)
    .update({
      status: nextStatus,
      approval: {
        required: false,
        requestedFrom: post.approval?.requestedFrom,
        decidedBy: decidedByLabel,
        decidedAt: new Date().toISOString(),
        note: note || undefined,
        // approvalToken intentionally omitted → cleared, link is now single-use spent.
      },
    });

  return nextStatus;
}

/** Posts awaiting a decision, oldest request first, for the Approvals queue. */
export async function listPendingApprovals(workspaceId: string): Promise<Post[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .where("status", "==", "pending_approval")
    .get();
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Post);
  // Sort by scheduled time in memory — the queue is small (tens), so it isn't
  // worth a composite index just to order it.
  return posts.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
}

/**
 * Posts whose approval was recently decided, most recent first.
 *
 * A decided post has moved on to `scheduled`/`draft`, so status can't identify
 * it — we key off `approval.decidedAt`, which only decided posts carry. Requires
 * the composite index on (workspaceId, approval.decidedAt desc).
 */
export async function listRecentlyDecided(workspaceId: string, max = 6): Promise<Post[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .orderBy("approval.decidedAt", "desc")
    .limit(max)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Post);
}

/** Count of posts awaiting approval — drives the sidebar Approvals badge. */
export async function countPendingApprovals(workspaceId: string): Promise<number> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .where("status", "==", "pending_approval")
    .count()
    .get();
  return snap.data().count;
}
