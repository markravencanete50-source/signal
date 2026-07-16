"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/dal";
import { createPlatformChange, deletePlatformChange } from "@/lib/db/platform-changes";

/** Admin management of the Pulse platform-changes feed. */

const addSchema = z.object({
  workspaceId: z.string().min(1),
  period: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(400),
});

export type PulseState = { error?: string };

export async function addPlatformChange(
  _prev: PulseState,
  formData: FormData,
): Promise<PulseState> {
  const parsed = addSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    period: formData.get("period"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  try {
    const { session } = await requireAdmin(parsed.data.workspaceId);
    await createPlatformChange({ ...parsed.data, createdBy: session.uid });
    revalidatePath("/pulse");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the note." };
  }
}

export async function removePlatformChange(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const id = String(formData.get("id") ?? "");
  await requireAdmin(workspaceId);
  await deletePlatformChange(id);
  revalidatePath("/pulse");
}
