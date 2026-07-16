"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin, requireBrandAccess } from "@/lib/auth/dal";
import { createBrand, deleteBrand, updateBrand } from "@/lib/db/brands";
import { ADMIN_ROLES } from "@/types";

export type BrandState = { error?: string; success?: string };

const createSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Give the brand a name").max(60),
  timezone: z.string().min(1),
  color: z.string().min(1),
});

export async function addBrand(_prev: BrandState, formData: FormData): Promise<BrandState> {
  const parsed = createSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    name: formData.get("name"),
    timezone: formData.get("timezone") || "Europe/London",
    color: formData.get("color") || "var(--chart-2)",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await requireAdmin(parsed.data.workspaceId);
    await createBrand(parsed.data);
    revalidatePath("/settings/brands");
    return { success: `${parsed.data.name} added.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the brand." };
  }
}

const updateSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  timezone: z.string().min(1),
  color: z.string().min(1),
});

export async function editBrand(formData: FormData): Promise<void> {
  const parsed = updateSchema.safeParse({
    brandId: formData.get("brandId"),
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    color: formData.get("color"),
  });
  if (!parsed.success) throw new Error("Invalid brand update.");

  await requireBrandAccess(parsed.data.brandId, ADMIN_ROLES);
  await updateBrand(parsed.data.brandId, {
    name: parsed.data.name,
    timezone: parsed.data.timezone,
    color: parsed.data.color,
  });
  revalidatePath("/settings/brands");
}

/**
 * Delete a brand and everything scoped to it.
 *
 * Guarded so the last brand can't be deleted — an empty workspace renders a
 * shell with no active brand and every data page dead-ends. The user deletes
 * the workspace instead if that's what they want.
 */
export async function removeBrand(formData: FormData): Promise<{ error?: string }> {
  const brandId = String(formData.get("brandId") ?? "");
  const remainingCount = Number(formData.get("remainingCount") ?? "0");

  if (remainingCount <= 1) {
    return { error: "You can't delete your only brand. Create another first." };
  }

  const { workspaceId } = await requireBrandAccess(brandId, ADMIN_ROLES);
  await deleteBrand(brandId);

  revalidatePath("/settings/brands");
  revalidatePath("/", "layout");
  void workspaceId;
  return {};
}
