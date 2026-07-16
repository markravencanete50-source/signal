"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWriter } from "@/lib/auth/dal";
import { createReport, deleteReport, getReport, refreshReport, setDigest } from "@/lib/db/reports";
import { getAppContext } from "@/lib/workspace-context";
import type { ReportPeriod } from "@/types";

/**
 * Reports actions. Every one authorises against the caller's OWN workspace (from
 * the session context) and, for edits, checks the target report belongs to that
 * workspace — the Admin SDK ignores Firestore rules, so this is the only gate.
 */

export type ReportFormState = { error?: string };

const createSchema = z.object({
  title: z.string().min(1).max(120),
  period: z.enum(["last-7-days", "last-30-days", "this-month", "last-month"]),
  brandIds: z.array(z.string().min(1)).min(1),
});

export async function createReportAction(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    period: formData.get("period"),
    brandIds: formData.getAll("brandIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  try {
    const { workspace, brands } = await getAppContext();
    const { session } = await requireWriter(workspace.id);

    // Reject brand ids the caller's workspace doesn't own.
    const owned = new Set(brands.map((b) => b.id));
    const brandIds = parsed.data.brandIds.filter((id) => owned.has(id));
    if (brandIds.length === 0) return { error: "Pick at least one of your brands." };

    await createReport({
      workspaceId: workspace.id,
      title: parsed.data.title,
      period: parsed.data.period as ReportPeriod,
      brandIds,
      createdBy: session.uid,
      now: new Date(),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the report." };
  }

  revalidatePath("/reports");
  return {};
}

/** Load a report and assert it belongs to the caller's workspace. */
async function authorizeReport(reportId: string) {
  const { workspace } = await getAppContext();
  await requireWriter(workspace.id);
  const report = await getReport(reportId);
  if (!report || report.workspaceId !== workspace.id) {
    throw new Error("Report not found.");
  }
  return report;
}

export async function refreshReportAction(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const id = String(formData.get("reportId") ?? "");
  try {
    const report = await authorizeReport(id);
    await refreshReport(report, new Date());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not refresh the report." };
  }
  revalidatePath("/reports");
  return {};
}

export async function deleteReportAction(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const id = String(formData.get("reportId") ?? "");
  try {
    await authorizeReport(id);
    await deleteReport(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the report." };
  }
  revalidatePath("/reports");
  return {};
}

const digestSchema = z.object({
  reportId: z.string().min(1),
  enabled: z.enum(["on", "off"]),
  weekday: z.coerce.number().int().min(0).max(6),
  recipientEmail: z.string().email().or(z.literal("")),
});

export async function setDigestAction(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const parsed = digestSchema.safeParse({
    reportId: formData.get("reportId"),
    enabled: formData.get("enabled"),
    weekday: formData.get("weekday"),
    recipientEmail: formData.get("recipientEmail"),
  });
  if (!parsed.success) return { error: "Check the digest settings." };

  try {
    const report = await authorizeReport(parsed.data.reportId);
    if (parsed.data.enabled === "on") {
      if (!parsed.data.recipientEmail) return { error: "Add a recipient email for the digest." };
      await setDigest(report.id, {
        enabled: true,
        weekday: parsed.data.weekday,
        recipientEmail: parsed.data.recipientEmail,
        lastSentAt: report.digest?.lastSentAt,
      });
    } else {
      await setDigest(report.id, null);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the digest." };
  }
  revalidatePath("/reports");
  return {};
}
