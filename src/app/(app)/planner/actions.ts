"use server";

import { revalidatePath } from "next/cache";

import { requireBrandAccess } from "@/lib/auth/dal";
import { getPost, reschedulePost } from "@/lib/db/posts";
import { WRITER_ROLES } from "@/types";

/**
 * Reschedule a post via drag-and-drop on the calendar.
 *
 * Resolves the brand from the post itself, then authorises — a caller can't
 * move another workspace's post by passing its id. `reschedulePost` additionally
 * refuses to move a published/publishing post.
 */
export async function rescheduleAction(
  postId: string,
  scheduledAtIso: string,
): Promise<{ error?: string }> {
  try {
    const post = await getPost(postId);
    if (!post) return { error: "Post not found." };

    await requireBrandAccess(post.brandId, WRITER_ROLES);
    await reschedulePost(postId, scheduledAtIso);

    revalidatePath("/planner");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reschedule." };
  }
}
