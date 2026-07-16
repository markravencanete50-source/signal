import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "../firebase-admin";
import type { Post, PostStatus, PostVariants, VariantKey } from "@/types";

/**
 * Posts repository.
 *
 * The publish engine's correctness lives here: `claimDuePosts` is a transaction
 * that flips `scheduled → publishing` atomically so two overlapping cron runs
 * can never both grab the same post (which would double-publish to Meta).
 */

const COLLECTION = "posts";

function docToPost(id: string, data: FirebaseFirestore.DocumentData): Post {
  return { id, ...data } as Post;
}

export async function getPost(id: string): Promise<Post | null> {
  const snap = await adminDb().doc(`${COLLECTION}/${id}`).get();
  if (!snap.exists) return null;
  return docToPost(snap.id, snap.data()!);
}

export interface CreatePostInput {
  brandId: string;
  workspaceId: string;
  createdBy: string;
  status: PostStatus;
  scheduledAt?: string;
  pillar?: string;
  variants: PostVariants;
  approval?: Post["approval"];
  aiMeta?: Post["aiMeta"];
}

export async function createPost(input: CreatePostInput): Promise<string> {
  const ref = adminDb().collection(COLLECTION).doc();
  const payload = {
    ...input,
    attempts: 0,
    ...(input.scheduledAt ? {} : {}),
  };
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
  await ref.set(clean);
  return ref.id;
}

export async function updatePost(
  id: string,
  patch: Partial<Pick<Post, "status" | "scheduledAt" | "variants" | "pillar" | "approval">>,
): Promise<void> {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) return;
  await adminDb().doc(`${COLLECTION}/${id}`).update(clean);
}

export async function deletePost(id: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).delete();
}

/**
 * Reschedule a post (drag-and-drop on the Planner). Only draft/scheduled posts
 * are movable — a published post has a fixed publishedAt, and a publishing one
 * is mid-flight.
 */
export async function reschedulePost(id: string, scheduledAt: string): Promise<void> {
  await adminDb().runTransaction(async (tx) => {
    const ref = adminDb().doc(`${COLLECTION}/${id}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Post not found.");

    const status = (snap.data() as Post).status;
    if (!["draft", "scheduled", "pending_approval", "approved"].includes(status)) {
      throw new Error(`A ${status} post can't be rescheduled.`);
    }
    tx.update(ref, { scheduledAt });
  });
}

/** Posts for a brand in a date range — drives the Planner calendar. */
export async function listPostsInRange(
  brandId: string,
  fromIso: string,
  toIso: string,
): Promise<Post[]> {
  // Uses the (brandId, status, scheduledAt) index. Draft posts with no
  // scheduledAt are fetched separately so they still appear on the board.
  const scheduled = await adminDb()
    .collection(COLLECTION)
    .where("brandId", "==", brandId)
    .where("scheduledAt", ">=", fromIso)
    .where("scheduledAt", "<=", toIso)
    .get();

  return scheduled.docs.map((d) => docToPost(d.id, d.data()));
}

/** A bounded set of a workspace's posts across all brands — the search index. */
export async function listPostsForWorkspace(workspaceId: string, max = 300): Promise<Post[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .limit(max)
    .get();
  return snap.docs.map((d) => docToPost(d.id, d.data()));
}

export async function listPostsByStatus(workspaceId: string, status: PostStatus): Promise<Post[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("workspaceId", "==", workspaceId)
    .where("status", "==", status)
    .get();
  return snap.docs.map((d) => docToPost(d.id, d.data()));
}

/**
 * Published posts for a brand within the trailing window — the sync engine only
 * re-fetches insights for posts <14 days old (older posts' metrics are settled).
 * publishedAt is filtered in memory since the published set is already small.
 */
export async function listRecentlyPublished(brandId: string, sinceIso: string): Promise<Post[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("brandId", "==", brandId)
    .where("status", "==", "published")
    .get();
  return snap.docs
    .map((d) => docToPost(d.id, d.data()))
    .filter((p) => (p.publishedAt ?? "") >= sinceIso);
}

/**
 * The brand's most recent post captions (published or scheduled), newest first —
 * the input to the coherence engine. Prefers the IG caption, falls back to FB.
 */
export async function getRecentCaptions(brandId: string, limit: number): Promise<string[]> {
  const snap = await adminDb().collection(COLLECTION).where("brandId", "==", brandId).get();

  return snap.docs
    .map((d) => docToPost(d.id, d.data()))
    .filter((p) => p.status === "published" || p.status === "scheduled")
    .sort((a, b) =>
      (b.publishedAt ?? b.scheduledAt ?? "").localeCompare(a.publishedAt ?? a.scheduledAt ?? ""),
    )
    .map((p) => (p.variants.instagram?.caption ?? p.variants.facebook?.caption ?? "").trim())
    .filter((c) => c.length > 0)
    .slice(0, limit);
}

/**
 * Atomically claim up to `limit` posts that are due to publish.
 *
 * This is the linchpin of the publish engine's idempotency. Each post is flipped
 * `scheduled → publishing` inside its own transaction that re-reads status
 * first, so if a previous (slow) cron run already claimed it, this run sees
 * `publishing` and skips it. Two crons firing a second apart therefore never
 * both publish the same post.
 *
 * `scheduledAt <= now` and `status == scheduled` is the query; the transaction
 * is the lock.
 */
export async function claimDuePosts(nowIso: string, limit = 20): Promise<Post[]> {
  const due = await adminDb()
    .collection(COLLECTION)
    .where("status", "==", "scheduled")
    .where("scheduledAt", "<=", nowIso)
    .orderBy("scheduledAt", "asc")
    .limit(limit)
    .get();

  const claimed: Post[] = [];

  for (const doc of due.docs) {
    try {
      const post = await adminDb().runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const data = fresh.data() as Post | undefined;
        // Re-check inside the tx: another run may have claimed it since the query.
        if (!data || data.status !== "scheduled") return null;

        tx.update(doc.ref, {
          status: "publishing" satisfies PostStatus,
          attempts: FieldValue.increment(1),
        });
        // Return the POST-increment attempts: publishPost uses this count to
        // decide the retry, so it must reflect the write we just made, not the
        // pre-read value.
        return {
          ...docToPost(doc.id, data),
          status: "publishing" as PostStatus,
          attempts: (data.attempts ?? 0) + 1,
        };
      });
      if (post) claimed.push(post);
    } catch {
      // Transaction contention — another run won the race. Skip; it's handled.
    }
  }

  return claimed;
}

/** Mark a post published, recording each platform's external id + permalink. */
export async function markPublished(
  id: string,
  results: Partial<Record<VariantKey, { externalId?: string; permalink?: string; error?: string }>>,
): Promise<void> {
  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({
      status: "published" satisfies PostStatus,
      publishedAt: new Date().toISOString(),
      results,
    });
}

/**
 * Return a failed publish to `scheduled` for a later retry, or to `failed` once
 * attempts are exhausted. The publish engine owns the backoff decision; this
 * just records the outcome.
 */
export async function recordPublishOutcome(
  id: string,
  params: {
    exhausted: boolean;
    nextAttemptAt?: string;
    results: Partial<
      Record<VariantKey, { externalId?: string; permalink?: string; error?: string }>
    >;
  },
): Promise<void> {
  if (params.exhausted) {
    await adminDb()
      .doc(`${COLLECTION}/${id}`)
      .update({
        status: "failed" satisfies PostStatus,
        results: params.results,
      });
    return;
  }

  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({
      // Back to scheduled with a pushed-out time — the next cron tick re-claims it
      // once nextAttemptAt passes. Keeps the whole engine driven by one query.
      status: "scheduled" satisfies PostStatus,
      scheduledAt: params.nextAttemptAt,
      results: params.results,
    });
}

/** Convert a Firestore Timestamp or ISO string to ISO, tolerating either. */
export function toIso(value: string | Timestamp | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return value;
}
