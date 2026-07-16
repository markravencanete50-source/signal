import "server-only";

import { ApprovalRequestEmail } from "@/emails/approval-request";
import { getBrand } from "@/lib/db/brands";
import { getAsset } from "@/lib/db/media";
import { listTeamMembers } from "@/lib/db/workspaces";
import { env } from "@/lib/env";
import { adminDb } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/resend";
import type { Post } from "@/types";

/**
 * Build and send the one-click approval email for a post to the workspace's
 * client(s).
 *
 * Shared by the composer's "Request approval" intent and the Approvals view's
 * "Send reminder" — both need the identical email, differing only in whether the
 * token was just minted or already lives on the post. Resolving recipients here
 * (rather than at each call site) keeps the "who is the client" rule in one place.
 *
 * No client with an email → returns `false` without sending, so the caller can
 * leave the post sitting in Approvals for a team member to hand off manually.
 */
export async function sendApprovalRequestEmail(post: Post, token: string): Promise<boolean> {
  const [members, brand, requesterSnap] = await Promise.all([
    listTeamMembers(post.workspaceId),
    getBrand(post.brandId),
    adminDb().doc(`users/${post.createdBy}`).get(),
  ]);

  const clients = members.filter((m) => m.role === "client" && m.email);
  if (clients.length === 0) return false;

  const variant = post.variants.instagram ?? post.variants.facebook;
  const caption = variant?.caption ?? "";
  const firstAssetId = variant?.mediaAssetIds[0];
  const asset = firstAssetId ? await getAsset(firstAssetId) : null;
  const imageUrl = asset
    ? asset.type === "video"
      ? asset.secureUrl.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg")
      : asset.secureUrl
    : undefined;

  const base = `${env().APP_URL}/approve/${token}`;
  await sendEmail({
    to: clients.map((c) => c.email),
    subject: `Approval needed: a ${brand?.name ?? "brand"} post`,
    react: ApprovalRequestEmail({
      brandName: brand?.name ?? "your brand",
      requesterName: requesterSnap.exists
        ? ((requesterSnap.data()?.name as string) ?? "Your team")
        : "Your team",
      caption,
      imageUrl,
      approveUrl: `${base}?d=approve`,
      rejectUrl: `${base}?d=reject`,
    }),
  });
  return true;
}
