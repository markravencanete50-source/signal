"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWriter } from "@/lib/auth/dal";
import { getSmartLink, updateSmartLink } from "@/lib/db/smartlinks";
import { getAppContext } from "@/lib/workspace-context";

/**
 * SmartLink editor save. Authorises the caller against the SmartLink's OWN
 * workspace (the Admin SDK ignores rules), then persists the edit. Click counts
 * are preserved per link id inside the repo, so the editor never carries them.
 */

export type SmartLinkState = { error?: string; ok?: boolean };

const schema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(60),
  subtitle: z.string().max(160),
  avatarText: z.string().min(1).max(2),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour."),
  slug: z.string().min(1).max(40),
  links: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1).max(60),
        url: z.string().url("Each link needs a valid URL."),
        hot: z.boolean(),
      }),
    )
    .max(12),
});

export async function saveSmartLinkAction(
  _prev: SmartLinkState,
  formData: FormData,
): Promise<SmartLinkState> {
  const raw = formData.get("payload");
  const parsed = schema.safeParse(JSON.parse(typeof raw === "string" ? raw : "{}"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the editor and try again." };
  }

  try {
    const { workspace } = await getAppContext();
    await requireWriter(workspace.id);

    const smartlink = await getSmartLink(parsed.data.id);
    if (!smartlink || smartlink.workspaceId !== workspace.id) {
      return { error: "SmartLink not found." };
    }

    await updateSmartLink(parsed.data.id, {
      title: parsed.data.title,
      subtitle: parsed.data.subtitle,
      avatarText: parsed.data.avatarText.toUpperCase(),
      accent: parsed.data.accent,
      slug: parsed.data.slug,
      links: parsed.data.links.map((l) => ({ ...l, clicks: 0 })),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the SmartLink." };
  }

  revalidatePath("/smartlink");
  return { ok: true };
}
