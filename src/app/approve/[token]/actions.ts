"use server";

import { z } from "zod";

import { findPostByApprovalToken, recordDecision } from "@/lib/db/approvals";
import { getBrand } from "@/lib/db/brands";
import { notifyWorkspaceAdmins } from "@/lib/db/notifications";

/**
 * Record a client's approval decision — public, no login.
 *
 * The token IS the authorisation: it's a 32-byte bearer credential from the
 * email and is single-use (cleared on decision). We re-fetch by token here
 * (the page render and this action are separate requests), so a spent or forged
 * token simply finds no post and returns an error rather than acting.
 */

const schema = z.object({
  token: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

export type DecisionState = { done?: "approved" | "rejected"; error?: string };

export async function submitDecision(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: "Invalid request." };

  const post = await findPostByApprovalToken(parsed.data.token);
  if (!post) {
    return { error: "This approval link has already been used or is no longer valid." };
  }

  const brand = await getBrand(post.brandId);
  await recordDecision(post, parsed.data.decision, parsed.data.note ?? "", "Client");

  // Notify the workspace so the requester sees the outcome in-app.
  await notifyWorkspaceAdmins(post.workspaceId, {
    title:
      parsed.data.decision === "approved"
        ? `Client approved a ${brand?.name ?? "brand"} post`
        : `Client requested changes on a ${brand?.name ?? "brand"} post`,
    body: parsed.data.note
      ? `"${parsed.data.note}"`
      : parsed.data.decision === "approved"
        ? "Approved with no note."
        : "Changes requested with no note.",
    href: "/approvals",
  }).catch(() => {});

  return { done: parsed.data.decision };
}
