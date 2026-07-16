"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSession } from "@/lib/auth/dal";
import { createBrand } from "@/lib/db/brands";
import { createWorkspace, listWorkspacesForUser } from "@/lib/db/workspaces";

/**
 * Workspace bootstrap.
 *
 * Server-side only — firestore.rules sets `allow create: if false` on
 * workspaces, because the client-side rule for adding a member requires being
 * an admin already, which is read from the member doc being created. A browser
 * literally cannot bootstrap itself without stranding an unadministrable
 * workspace. See DECISIONS #005.
 */

const schema = z.object({
  workspaceName: z.string().trim().min(2, "Give your workspace a name").max(60),
  brandName: z.string().trim().min(1, "Add your first brand").max(60),
});

export type OnboardingState = { error?: string };

export async function createWorkspaceAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await requireSession();

  const parsed = schema.safeParse({
    workspaceName: formData.get("workspaceName"),
    brandName: formData.get("brandName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  // Guard against a double-submit creating two workspaces. The form disables on
  // submit, but a server action is a public endpoint — the form isn't the gate.
  const existing = await listWorkspacesForUser(session.uid);
  if (existing.length > 0) redirect("/dashboard");

  const workspace = await createWorkspace({
    name: parsed.data.workspaceName,
    ownerId: session.uid,
  });

  await createBrand({
    workspaceId: workspace.id,
    name: parsed.data.brandName,
  });

  // redirect() throws internally, so it must sit outside any try/catch that
  // would swallow the control-flow exception.
  redirect("/dashboard");
}
