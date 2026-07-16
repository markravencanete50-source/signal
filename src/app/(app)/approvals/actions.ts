"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sendApprovalRequestEmail } from "@/lib/approvals/send-request-email";
import { requireBrandAccess } from "@/lib/auth/dal";
import { recordDecision, requestApproval } from "@/lib/db/approvals";
import { getPost } from "@/lib/db/posts";
import { WRITER_ROLES } from "@/types";

/**
 * Team-side approval actions, from the Approvals view.
 *
 * Both authorise the caller against the post's *brand* (writer roles) before
 * touching anything — the Admin SDK ignores Firestore rules, so this is the only
 * gate. A client role can't reach these; they act through the email link instead.
 */

export type ApprovalActionState = { ok?: boolean; error?: string };

const schema = z.object({ postId: z.string().min(1) });

/**
 * Re-send the approval email. Re-mints the token so any older forwarded link
 * dies — the freshest email is always the only working one.
 */
export async function sendReminder(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const parsed = schema.safeParse({ postId: formData.get("postId") });
  if (!parsed.success) return { error: "Invalid request." };

  const post = await getPost(parsed.data.postId);
  if (!post) return { error: "This post no longer exists." };

  try {
    await requireBrandAccess(post.brandId, WRITER_ROLES);
  } catch {
    return { error: "You don't have access to this post." };
  }

  const token = await requestApproval(post.id, post.approval?.requestedFrom ?? "");
  const fresh = await getPost(post.id);
  const sent = fresh ? await sendApprovalRequestEmail(fresh, token) : false;
  if (!sent) return { error: "No client with an email is set on this workspace." };

  revalidatePath("/approvals");
  return { ok: true };
}

/**
 * Approve on the client's behalf (e.g. they replied by phone). Records the
 * decision under the team member's name and clears the token, exactly as the
 * one-click flow would.
 */
export async function markApproved(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const parsed = schema.safeParse({ postId: formData.get("postId") });
  if (!parsed.success) return { error: "Invalid request." };

  const post = await getPost(parsed.data.postId);
  if (!post) return { error: "This post no longer exists." };

  let decidedBy = "A team member (on behalf of client)";
  try {
    const { session } = await requireBrandAccess(post.brandId, WRITER_ROLES);
    decidedBy = `${session.email} (on behalf of client)`;
  } catch {
    return { error: "You don't have access to this post." };
  }

  await recordDecision(post, "approved", "", decidedBy);

  revalidatePath("/approvals");
  return { ok: true };
}
