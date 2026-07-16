import "server-only";

import { getAdapter } from "@/adapters/registry";
import { PublishFailedEmail } from "@/emails/publish-failed";
import {
  PLATFORM_KEY,
  VARIANT_KEY,
  type Platform,
  type Post,
  type PostVariant,
  type VariantKey,
} from "@/types";
import type { MediaAsset } from "@/types/media";

import { transformedUrl } from "./cloudinary";
import { getBrand } from "./db/brands";
import { getDecryptedToken, listConnectionsForBrand, markConnectionError } from "./db/connections";
import { getAsset, recordUsage } from "./db/media";
import { notifyWorkspaceAdmins } from "./db/notifications";
import { markPublished, recordPublishOutcome } from "./db/posts";
import { env } from "./env";
import { sendEmail } from "./resend";
import { decideRetry } from "@/services/publish-policy";

/**
 * The publish engine. Called by `/api/cron/publish` for each claimed post.
 *
 * A post arrives here already flipped to `publishing` (claimDuePosts holds the
 * lock), so this function's job is: for each enabled platform variant, resolve
 * media to public URLs, publish via the adapter, and record the outcome. It is
 * idempotent per the claim lock — the same post is never handed to two runs.
 *
 * "Enabled variant" = a key present in `post.variants`. The Composer only writes
 * variants for platforms the user toggled on.
 */
export async function publishPost(post: Post): Promise<void> {
  const results: Partial<
    Record<VariantKey, { externalId?: string; permalink?: string; error?: string }>
  > = {};
  const errors: string[] = [];

  const connections = await listConnectionsForBrand(post.brandId);

  for (const variantKey of Object.keys(post.variants) as VariantKey[]) {
    const variant = post.variants[variantKey];
    if (!variant) continue;

    const platform = PLATFORM_KEY[variantKey];
    const connection = connections.find((c) => c.platform === platform);

    if (!connection) {
      results[variantKey] = { error: `No ${platform} account connected.` };
      errors.push(`${variantKey}: not connected`);
      continue;
    }

    try {
      const token = await getDecryptedToken(connection);
      const adapter = getAdapter(platform);

      // Adapters expect mediaAssetIds to be PUBLIC URLs at publish time (Meta
      // fetches them itself). Resolve stored asset ids → transformed Cloudinary
      // URLs sized for this platform.
      const resolved = await resolveVariantMedia(variant, platform);

      const result = await adapter.publish(connection, token, resolved);
      results[variantKey] = { externalId: result.externalId, permalink: result.permalink };

      // Usage tracking for the media library badges — best-effort.
      await Promise.all(
        variant.mediaAssetIds.map((id) =>
          recordUsage(id, { postId: post.id, platform }).catch(() => {}),
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown publish error";
      results[variantKey] = { error: message };
      errors.push(`${variantKey}: ${message}`);

      // If the token itself is dead, mark the connection so the tokens cron and
      // the Settings badge surface it — a retry won't fix an expired token.
      if (isAuthError(message)) {
        await markConnectionError(connection.id, message).catch(() => {});
      }
    }
  }

  // Success = every attempted variant produced an externalId.
  const anyFailed = Object.values(results).some((r) => r.error);

  if (!anyFailed) {
    await markPublished(post.id, results);
    return;
  }

  // Something failed — decide retry vs give up. `post.attempts` was already
  // incremented by claimDuePosts, so it reflects this attempt.
  const decision = decideRetry(post.attempts, new Date());
  await recordPublishOutcome(post.id, {
    exhausted: decision.exhausted,
    nextAttemptAt: decision.nextAttemptAt,
    results,
  });

  if (decision.exhausted) {
    await onExhausted(post, errors.join("; "));
  }
}

/**
 * Replace a variant's stored media asset ids with public, platform-sized URLs.
 *
 * A watermark-reformatted asset publishes its cleaned re-export instead of the
 * original — the native-format guard's whole point.
 */
async function resolveVariantMedia(variant: PostVariant, platform: Platform): Promise<PostVariant> {
  const urls = await Promise.all(
    variant.mediaAssetIds.map(async (id) => {
      const asset = await getAsset(id);
      if (!asset) throw new Error(`Media asset ${id} not found.`);
      return deliveryUrl(asset, platform);
    }),
  );

  return { ...variant, mediaAssetIds: urls };
}

function deliveryUrl(asset: MediaAsset, platform: Platform): string {
  // Prefer the guard's cleaned re-export when one exists.
  if (asset.guard?.reformatted && asset.guard.reformattedUrl) {
    return asset.guard.reformattedUrl;
  }

  const isVideo = asset.type === "video";
  const transform = platform === "ig" ? (isVideo ? "ig_reel" : "ig_feed") : "fb_feed";
  return transformedUrl(asset.cloudinaryPublicId, transform, isVideo ? "video" : "image");
}

/** After a post permanently fails: notify admins in-app and by email. */
async function onExhausted(post: Post, error: string): Promise<void> {
  const brand = await getBrand(post.brandId);
  const brandName = brand?.name ?? "your brand";
  const summary = summarisePost(post);
  const plannerUrl = `${env().APP_URL}/planner`;

  await notifyWorkspaceAdmins(post.workspaceId, {
    title: "A post failed to publish",
    body: `${brandName}: ${summary}`,
    href: "/planner",
  }).catch(() => {});

  // Email every workspace admin. Best-effort — a Resend outage must not throw
  // out of the cron and block other posts.
  try {
    const members = brand
      ? await import("./firebase-admin").then(({ adminDb }) =>
          adminDb().collection(`workspaces/${post.workspaceId}/members`).get(),
        )
      : null;

    if (members) {
      const adminUids = members.docs
        .filter((d) => ["owner", "admin"].includes(d.data().role))
        .map((d) => d.id);

      const emails = await resolveEmails(adminUids);
      if (emails.length > 0) {
        await sendEmail({
          to: emails,
          subject: `A post for ${brandName} failed to publish`,
          react: PublishFailedEmail({
            brandName,
            postSummary: summary,
            error,
            attempts: post.attempts,
            plannerUrl,
          }),
        });
      }
    }
  } catch {
    // Notification already recorded in-app; email is a bonus.
  }
}

async function resolveEmails(uids: string[]): Promise<string[]> {
  const { adminDb } = await import("./firebase-admin");
  const users = await Promise.all(uids.map((uid) => adminDb().doc(`users/${uid}`).get()));
  return users
    .map((u) => (u.exists ? (u.data()?.email as string | undefined) : undefined))
    .filter((e): e is string => Boolean(e));
}

function summarisePost(post: Post): string {
  const caption =
    post.variants.instagram?.caption ?? post.variants.facebook?.caption ?? "(no caption)";
  const platforms = (Object.keys(post.variants) as VariantKey[]).map(
    (k) => VARIANT_KEY[PLATFORM_KEY[k]],
  );
  void platforms;
  return caption.slice(0, 80) + (caption.length > 80 ? "…" : "");
}

/** Heuristic: does this error mean the token is dead (vs a transient failure)? */
function isAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("token") || m.includes("expired") || m.includes("reconnect") || m.includes("oauth")
  );
}
