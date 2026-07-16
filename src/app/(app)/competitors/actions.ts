"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireBrandAccess } from "@/lib/auth/dal";
import { addCompetitor, getCompetitor, removeCompetitor } from "@/lib/db/competitors";
import { WRITER_ROLES, type Platform } from "@/types";

/**
 * Competitor tracking actions. Add/remove a tracked profile, authorised against
 * the brand. Snapshots are gathered by the daily cron, not here.
 */

export type CompetitorState = { error?: string };

const addSchema = z.object({
  brandId: z.string().min(1),
  platform: z.enum(["fb", "ig"]),
  handle: z
    .string()
    .min(1)
    .max(60)
    .transform((h) => h.trim().replace(/^@/, "")),
});

export async function addCompetitorAction(
  _prev: CompetitorState,
  formData: FormData,
): Promise<CompetitorState> {
  const parsed = addSchema.safeParse({
    brandId: formData.get("brandId"),
    platform: formData.get("platform"),
    handle: formData.get("handle"),
  });
  if (!parsed.success) return { error: "Enter a valid handle." };
  if (!parsed.data.handle) return { error: "Enter a handle to track." };

  try {
    const { workspaceId, session } = await requireBrandAccess(parsed.data.brandId, WRITER_ROLES);
    await addCompetitor({
      workspaceId,
      brandId: parsed.data.brandId,
      platform: parsed.data.platform as Platform,
      handle: `@${parsed.data.handle}`,
      addedBy: session.uid,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the competitor." };
  }

  revalidatePath("/competitors");
  return {};
}

export async function removeCompetitorAction(
  _prev: CompetitorState,
  formData: FormData,
): Promise<CompetitorState> {
  const id = String(formData.get("competitorId") ?? "");
  try {
    const competitor = await getCompetitor(id);
    if (!competitor) return { error: "Already removed." };
    await requireBrandAccess(competitor.brandId, WRITER_ROLES);
    await removeCompetitor(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the competitor." };
  }

  revalidatePath("/competitors");
  return {};
}
