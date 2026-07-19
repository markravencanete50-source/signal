import "server-only";

import { getAdapter } from "@/adapters/registry";
import { decideVerifyRetry } from "@/services/publish-verify";
import { PLATFORM_KEY, VARIANT_KEY, type Post, type VariantKey } from "@/types";

import { getDecryptedToken, listConnectionsForBrand } from "./db/connections";
import { notifyWorkspaceAdmins } from "./db/notifications";
import {
  listPostsAwaitingVerification,
  markVerificationConfirmed,
  markVerificationMissing,
  markVerificationUnverified,
  rescheduleVerification,
} from "./db/posts";

/**
 * Verify-after-publish engine. Called by `/api/cron/verify`.
 *
 * A publish that Meta *accepted* isn't proof the post *appeared* — the API can
 * degrade, or a post can be silently removed. A few minutes after publishing,
 * this re-fetches each post by its external id and:
 *
 *   - confirms it (state → confirmed) when present,
 *   - alerts admins (state → missing) when the platform says it's gone — the
 *     silent-failure catch no mainstream tool does,
 *   - retries with backoff, then gives up quietly (state → unverified) when it
 *     simply can't reach Meta, so a network blip never raises a false alarm.
 *
 * Idempotent: each post leaves `pending` exactly once, and a transient retry
 * only ever pushes `dueAt` out.
 */

export interface VerifyRunResult {
  checked: number;
  confirmed: number;
  missing: number;
  retried: number;
  unverified: number;
}

export async function runPublishVerification(now = new Date()): Promise<VerifyRunResult> {
  const posts = await listPostsAwaitingVerification(now.toISOString());
  const result: VerifyRunResult = {
    checked: 0,
    confirmed: 0,
    missing: 0,
    retried: 0,
    unverified: 0,
  };
  const nowIso = now.toISOString();

  for (const post of posts) {
    result.checked++;

    const connections = await listConnectionsForBrand(post.brandId);
    const results = post.results ?? {};

    let anyMissing = false;
    let anyTransient = false;
    const missingDetails: string[] = [];

    for (const variantKey of Object.keys(results) as VariantKey[]) {
      const externalId = results[variantKey]?.externalId;
      if (!externalId) continue; // a failed variant wouldn't reach a published post

      const platform = PLATFORM_KEY[variantKey];
      const connection = connections.find((c) => c.platform === platform);
      if (!connection) {
        // Disconnected since publishing — can't confirm, treat as transient.
        anyTransient = true;
        continue;
      }

      try {
        const token = await getDecryptedToken(connection);
        const outcome = await getAdapter(platform).verifyPublished(connection, token, externalId);
        if (outcome.transient) {
          anyTransient = true;
        } else if (!outcome.exists) {
          anyMissing = true;
          missingDetails.push(`${VARIANT_KEY[platform]}: ${outcome.detail ?? "not found"}`);
        }
      } catch {
        anyTransient = true;
      }
    }

    // Missing wins over transient: if the platform explicitly lost even one
    // variant, that's an alert worth raising now.
    if (anyMissing) {
      await markVerificationMissing(post.id, nowIso, missingDetails.join("; ")).catch(() => {});
      await notifyWorkspaceAdmins(post.workspaceId, {
        title: "A published post can't be found",
        body: `${summarise(post)} — ${missingDetails.join("; ")}. It may have been removed by the platform or never appeared. Check the post and re-publish if needed.`,
        href: "/planner",
      }).catch(() => {});
      result.missing++;
      continue;
    }

    if (anyTransient) {
      const attempts = (post.verification?.attempts ?? 0) + 1;
      const decision = decideVerifyRetry(attempts, now);
      if (decision.exhausted) {
        await markVerificationUnverified(
          post.id,
          nowIso,
          "Could not confirm with the platform after several tries.",
        ).catch(() => {});
        result.unverified++;
      } else {
        await rescheduleVerification(post.id, decision.nextDueAt!, attempts).catch(() => {});
        result.retried++;
      }
      continue;
    }

    await markVerificationConfirmed(post.id, nowIso).catch(() => {});
    result.confirmed++;
  }

  return result;
}

function summarise(post: Post): string {
  const caption =
    post.variants.instagram?.caption ?? post.variants.facebook?.caption ?? "(no caption)";
  return caption.slice(0, 80) + (caption.length > 80 ? "…" : "");
}
