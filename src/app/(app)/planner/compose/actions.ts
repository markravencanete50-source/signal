"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAdapter } from "@/adapters/registry";
import { sendApprovalRequestEmail } from "@/lib/approvals/send-request-email";
import { requireBrandAccess } from "@/lib/auth/dal";
import { requestApproval } from "@/lib/db/approvals";
import { getDecryptedToken, listConnectionsForBrand } from "@/lib/db/connections";
import { getAsset } from "@/lib/db/media";
import {
  claimPostById,
  createPost,
  getPost,
  recordPublishOutcome,
  updatePost,
} from "@/lib/db/posts";
import { listTeamMembers } from "@/lib/db/workspaces";
import { publishPost } from "@/lib/publish-engine";
import { decideRetry } from "@/services/publish-policy";
import { WRITER_ROLES, type PostStatus, type PostVariant, type PostVariants } from "@/types";

/**
 * Composer submit actions: save draft, schedule, publish now, request approval.
 *
 * All four go through `createPostFrom`, which validates media against each
 * enabled platform's specs (via the adapter) before writing — the same
 * validation the Composer shows live, re-run server-side so a hand-crafted
 * request can't bypass it.
 */

const variantSchema = z.object({
  caption: z.string().max(63206),
  mediaAssetIds: z.array(z.string()).max(10),
  firstComment: z.string().max(2200).optional(),
  link: z.string().url().optional().or(z.literal("")),
});

const composeSchema = z.object({
  brandId: z.string().min(1),
  /** Present when editing an existing post from the Planner. */
  postId: z.string().optional(),
  platforms: z.array(z.enum(["fb", "ig"])).min(1),
  variants: z.object({
    facebook: variantSchema.optional(),
    instagram: variantSchema.optional(),
  }),
  scheduledAt: z.string().optional(),
  intent: z.enum(["draft", "schedule", "publish", "request_approval"]),
  pillar: z.string().optional(),
  predictedScore: z.number().optional(),
  predictedReasoning: z.string().optional(),
});

export type ComposeState = { error?: string };

export async function submitPost(_prev: ComposeState, formData: FormData): Promise<ComposeState> {
  const raw = formData.get("payload");
  const parsed = composeSchema.safeParse(JSON.parse(typeof raw === "string" ? raw : "{}"));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the composer and try again." };
  }

  const data = parsed.data;

  try {
    const { workspaceId, session } = await requireBrandAccess(data.brandId, WRITER_ROLES);

    // Build the variants map from only the enabled platforms.
    const variants: PostVariants = {};
    if (data.platforms.includes("fb") && data.variants.facebook) {
      variants.facebook = normaliseVariant(data.variants.facebook);
    }
    if (data.platforms.includes("ig") && data.variants.instagram) {
      variants.instagram = normaliseVariant(data.variants.instagram);
    }

    if (Object.keys(variants).length === 0) {
      return { error: "Add a caption for at least one selected platform." };
    }

    // Server-side media validation — the authoritative check.
    const mediaError = await validateMedia(variants);
    if (mediaError) return { error: mediaError };

    // Instagram requires media; enforce before it fails at publish time.
    if (variants.instagram && variants.instagram.mediaAssetIds.length === 0) {
      return { error: "Instagram posts need at least one image or video." };
    }

    const { status, scheduledAt } = resolveStatus(data.intent, data.scheduledAt);

    if ((status === "scheduled" || status === "publishing") && !scheduledAt) {
      return { error: "Pick a time to schedule this post." };
    }

    let postId: string;

    if (data.postId) {
      // Editing an existing post. The brand-match check matters: brandId is
      // what was authorised above, so a post from another brand/workspace can't
      // be smuggled in via its id.
      const existing = await getPost(data.postId);
      if (!existing || existing.brandId !== data.brandId) {
        return { error: "This post no longer exists." };
      }
      if (!EDITABLE_STATUSES.includes(existing.status)) {
        return { error: `A ${existing.status} post can't be edited here.` };
      }
      await updatePost(data.postId, { status, scheduledAt, pillar: data.pillar, variants });
      postId = data.postId;
    } else {
      postId = await createPost({
        brandId: data.brandId,
        workspaceId,
        createdBy: session.uid,
        status,
        scheduledAt,
        pillar: data.pillar,
        variants,
        aiMeta:
          data.predictedScore !== undefined
            ? {
                suggested: false,
                predictedScore: data.predictedScore,
                reasoning: data.predictedReasoning,
              }
            : undefined,
      });
    }

    // Approval flow: mint a token and email the workspace's client(s) a
    // one-click approve/reject link. A missing email isn't fatal — the post
    // still sits in Approvals for a team member to hand off.
    if (data.intent === "request_approval") {
      await sendApprovalRequest(postId, workspaceId).catch(() => {});
    }

    // "Publish now" publishes SYNCHRONOUSLY, right here, through the same
    // claim-lock + engine as the cron — the cron remains the backstop for
    // scheduled posts and retries, but an immediate publish must never sit
    // waiting on an external scheduler's clock (GitHub cron has a 5-minute
    // floor and is throttled under load; that gap is exactly how "Publish now"
    // posts silently went nowhere).
    if (data.intent === "publish") {
      const publishError = await publishNow(postId);
      if (publishError) {
        revalidatePath("/planner");
        return { error: publishError };
      }
    }

    revalidatePath("/planner");
    revalidatePath("/approvals");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the post." };
  }

  redirect("/planner");
}

const EDITABLE_STATUSES: PostStatus[] = [
  "draft",
  "scheduled",
  "pending_approval",
  "approved",
  "failed",
];

/**
 * Claim + publish one post inline and report the outcome as a user-facing
 * error string (null = published). A failed publish is handed to the normal
 * retry policy, so the cron re-attempts it — the user sees the real error
 * immediately instead of a post that silently never appears.
 */
async function publishNow(postId: string): Promise<string | null> {
  const claimed = await claimPostById(postId);
  // Not claimable = a cron tick beat us to it by milliseconds — it's publishing.
  if (!claimed) return null;

  let outcome: { ok: boolean; errors: string[] };
  try {
    outcome = await publishPost(claimed);
  } catch (err) {
    // Unexpected throw (network/Firestore hiccup) — reset via the retry policy
    // so the post isn't stranded in `publishing`, then tell the user.
    const message = err instanceof Error ? err.message : "Unknown publish error";
    const decision = decideRetry(claimed.attempts, new Date());
    await recordPublishOutcome(postId, {
      exhausted: decision.exhausted,
      nextAttemptAt: decision.nextAttemptAt,
      results: { facebook: { error: message }, instagram: { error: message } },
    }).catch(() => {});
    return `Publishing failed: ${message}${decision.exhausted ? "" : " — it will be retried automatically."}`;
  }

  if (outcome.ok) return null;

  // publishPost already recorded the failure + retry decision; read the post
  // back only to phrase whether a retry is coming or attempts are exhausted.
  const after = await getPost(postId);
  return `Publishing failed: ${outcome.errors[0] ?? "unknown error"}${
    after?.status === "failed" ? "" : " — it will be retried automatically."
  }`;
}

/**
 * Edit the caption of an ALREADY-PUBLISHED Facebook post. Facebook allows
 * updating a Page post's message via the Graph API; Instagram does not expose
 * caption editing at all, which is why this is FB-only. The stored variant is
 * updated too so Signal and Facebook stay in agreement.
 */
export async function updatePublishedCaption(
  postId: string,
  caption: string,
): Promise<{ error?: string }> {
  try {
    const post = await getPost(postId);
    if (!post) return { error: "Post not found." };
    if (post.status !== "published") return { error: "Only published posts can use this." };

    await requireBrandAccess(post.brandId, WRITER_ROLES);

    const externalId = post.results?.facebook?.externalId;
    if (!externalId) return { error: "This post has no published Facebook copy to edit." };

    const connection = (await listConnectionsForBrand(post.brandId)).find(
      (c) => c.platform === "fb",
    );
    if (!connection) return { error: "No Facebook account connected." };

    const adapter = getAdapter("fb");
    if (!adapter.updateCaption) return { error: "Editing published posts isn't supported here." };

    const token = await getDecryptedToken(connection);
    await adapter.updateCaption(connection, token, externalId, caption);

    const variants = { ...post.variants, facebook: { ...post.variants.facebook!, caption } };
    await updatePost(postId, { variants });

    revalidatePath("/planner");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the caption." };
  }
}

function normaliseVariant(v: z.infer<typeof variantSchema>): PostVariant {
  return {
    caption: v.caption,
    mediaAssetIds: v.mediaAssetIds,
    ...(v.firstComment ? { firstComment: v.firstComment } : {}),
    ...(v.link ? { link: v.link } : {}),
  };
}

/**
 * "Publish now" is modelled as scheduled-for-now rather than a direct publish:
 * the post enters the same idempotent, transaction-locked pipeline as every
 * other scheduled post instead of a second, untested code path. The next cron
 * tick (≤1 min) picks it up.
 */
function resolveStatus(
  intent: z.infer<typeof composeSchema>["intent"],
  scheduledAt?: string,
): { status: PostStatus; scheduledAt?: string } {
  switch (intent) {
    case "draft":
      return { status: "draft", scheduledAt };
    case "request_approval":
      return { status: "pending_approval", scheduledAt };
    case "publish":
      return { status: "scheduled", scheduledAt: new Date().toISOString() };
    case "schedule":
      return { status: "scheduled", scheduledAt };
  }
}

/** Validate each variant's first media asset against the platform's specs. */
async function validateMedia(variants: PostVariants): Promise<string | null> {
  for (const [key, variant] of Object.entries(variants)) {
    if (!variant || variant.mediaAssetIds.length === 0) continue;
    const platform = key === "instagram" ? "ig" : "fb";
    const adapter = getAdapter(platform);

    for (const assetId of variant.mediaAssetIds) {
      const asset = await getAsset(assetId);
      if (!asset) return `A selected media item no longer exists.`;

      const result = adapter.validateMedia({
        type: asset.type,
        format: asset.format,
        width: asset.width,
        height: asset.height,
        bytes: asset.bytes,
        durationSec: asset.durationSec,
        url: asset.secureUrl,
      });
      if (!result.ok) return result.errors[0] ?? "Media doesn't meet the platform's specs.";
    }
  }
  return null;
}

/**
 * Mint an approval token and email the workspace's client(s) a one-click link.
 *
 * `requestApproval` records the first client as `requestedFrom` for the audit
 * trail; `sendApprovalRequestEmail` handles recipient resolution and the render.
 * Best-effort — a Resend outage leaves the post in Approvals for manual handling.
 */
async function sendApprovalRequest(postId: string, workspaceId: string): Promise<void> {
  const clients = (await listTeamMembers(workspaceId)).filter(
    (m) => m.role === "client" && m.email,
  );
  const token = await requestApproval(postId, clients[0]?.email ?? "");
  if (clients.length === 0) return; // no client to email; post sits in Approvals

  const post = await getPost(postId);
  if (post) await sendApprovalRequestEmail(post, token);
}
