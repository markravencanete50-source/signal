import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { claimDuePosts, recordPublishOutcome } from "@/lib/db/posts";
import { publishPost } from "@/lib/publish-engine";
import { decideRetry } from "@/services/publish-policy";

/**
 * POST /api/cron/publish — the publish engine's clock. Runs every minute.
 *
 * Flow: authorise → atomically claim ≤20 due posts (scheduled + due) → publish
 * each. The claim is a per-post transaction lock, so this handler is idempotent
 * and safe to run concurrently: a second invocation sees already-claimed posts
 * as `publishing` and skips them.
 *
 * GET is also allowed because Vercel Cron issues GET by default; both paths do
 * the same work behind the cron-secret check.
 */
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const posts = await claimDuePosts(nowIso, 20);

  // Publish sequentially. Parallelism here would multiply peak Meta API load and
  // makes rate-limit handling harder to reason about; 20 posts/minute is ample.
  const outcomes: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const post of posts) {
    try {
      await publishPost(post);
      outcomes.push({ id: post.id, ok: true });
    } catch (err) {
      // publishPost handles per-variant failures internally; reaching here means
      // an unexpected throw (e.g. Firestore hiccup) that would otherwise strand
      // the post in `publishing` — the due-posts query only sees `scheduled`, so
      // nothing would ever reclaim it. Reset it via the normal retry policy so
      // the next tick picks it up.
      const message = err instanceof Error ? err.message : "unknown";
      const decision = decideRetry(post.attempts, new Date());
      await recordPublishOutcome(post.id, {
        exhausted: decision.exhausted,
        nextAttemptAt: decision.nextAttemptAt,
        results: { facebook: { error: message }, instagram: { error: message } },
      }).catch(() => {});
      outcomes.push({ id: post.id, ok: false, error: message });
    }
  }

  return NextResponse.json({ claimed: posts.length, outcomes });
}

export const POST = handle;
export const GET = handle;
