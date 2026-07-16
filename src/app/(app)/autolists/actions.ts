"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireBrandAccess } from "@/lib/auth/dal";
import {
  createAutolist,
  deleteAutolist,
  getAutolist,
  setAutolistEnabled,
} from "@/lib/db/autolists";
import { nextRunFrom } from "@/services/autolist";
import { WRITER_ROLES, type Platform } from "@/types";

/**
 * Autolist actions. Create/toggle/delete, all authorised against the target
 * brand (Admin SDK ignores rules). The engine does the publishing; these just
 * manage the queue definitions.
 */

export type AutolistState = { error?: string };

const platform = z.enum(["fb", "ig"]);

const evergreenItem = z.object({
  caption: z.string().min(1).max(2200),
  mediaAssetIds: z.array(z.string()).max(10).default([]),
});

const createSchema = z
  .object({
    brandId: z.string().min(1),
    name: z.string().min(1).max(80),
    type: z.enum(["evergreen", "rss"]),
    platforms: z.array(platform).min(1),
    cadenceDays: z.coerce.number().int().min(1).max(90),
    retireBelowIntent: z.coerce.number().int().min(0).max(100).nullable().default(null),
    items: z.array(evergreenItem).max(100).default([]),
    rssUrl: z.string().url().optional().or(z.literal("")),
  })
  .refine((d) => d.type === "rss" || d.items.length > 0, {
    message: "Add at least one post to an evergreen autolist.",
  })
  .refine((d) => d.type === "evergreen" || Boolean(d.rssUrl), {
    message: "An RSS autolist needs a feed URL.",
  });

export async function createAutolistAction(
  _prev: AutolistState,
  formData: FormData,
): Promise<AutolistState> {
  const raw = formData.get("payload");
  const parsed = createSchema.safeParse(JSON.parse(typeof raw === "string" ? raw : "{}"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const d = parsed.data;

  try {
    const { workspaceId, session } = await requireBrandAccess(d.brandId, WRITER_ROLES);

    await createAutolist({
      workspaceId,
      brandId: d.brandId,
      createdBy: session.uid,
      name: d.name,
      type: d.type,
      enabled: true,
      platforms: d.platforms as Platform[],
      cadenceDays: d.cadenceDays,
      // Start the first run one cadence out, so creating one doesn't fire instantly.
      nextRunAt: nextRunFrom(new Date(), d.cadenceDays),
      items: d.items.map((it, i) => ({
        id: `${Date.now()}_${i}`,
        caption: it.caption,
        mediaAssetIds: it.mediaAssetIds,
      })),
      retireBelowIntent: d.type === "evergreen" ? d.retireBelowIntent : null,
      rssUrl: d.type === "rss" ? (d.rssUrl as string) : undefined,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the autolist." };
  }

  revalidatePath("/autolists");
  return {};
}

async function authorize(autolistId: string) {
  const autolist = await getAutolist(autolistId);
  if (!autolist) throw new Error("Autolist not found.");
  await requireBrandAccess(autolist.brandId, WRITER_ROLES);
  return autolist;
}

export async function toggleAutolistAction(
  _prev: AutolistState,
  formData: FormData,
): Promise<AutolistState> {
  const id = String(formData.get("autolistId") ?? "");
  const enabled = formData.get("enabled") === "on";
  try {
    await authorize(id);
    await setAutolistEnabled(id, enabled);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the autolist." };
  }
  revalidatePath("/autolists");
  return {};
}

export async function deleteAutolistAction(
  _prev: AutolistState,
  formData: FormData,
): Promise<AutolistState> {
  const id = String(formData.get("autolistId") ?? "");
  try {
    await authorize(id);
    await deleteAutolist(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the autolist." };
  }
  revalidatePath("/autolists");
  return {};
}
