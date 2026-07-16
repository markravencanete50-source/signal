"use server";

import { revalidatePath } from "next/cache";

import { requireBrandAccess } from "@/lib/auth/dal";
import { generateSuggestions } from "@/lib/ai/suggest";
import { getBrand } from "@/lib/db/brands";
import { listConnectionsForBrand } from "@/lib/db/connections";
import { listPostMetrics } from "@/lib/db/metrics";
import { createPost } from "@/lib/db/posts";
import { bestTimeSlots, type PostTiming } from "@/services/besttime";
import { WRITER_ROLES, type Platform, type PostVariants } from "@/types";

/**
 * "Generate this week's plan" — turn AI suggestions into 5 scheduled drafts,
 * each placed at one of the brand's best-time slots for the coming week.
 *
 * Drafts (not scheduled posts) so nothing publishes without review; they land on
 * the Planner ready to edit. The best-time slots come from the same pure engine
 * the Composer uses, computed from the brand's own postMetrics.
 */
export async function generateWeekPlan(
  formData: FormData,
): Promise<{ error?: string; created?: number }> {
  const brandId = String(formData.get("brandId") ?? "");

  try {
    const { workspaceId, session } = await requireBrandAccess(brandId, WRITER_ROLES);

    const [brand, connections, metrics, suggestResult] = await Promise.all([
      getBrand(brandId),
      listConnectionsForBrand(brandId),
      listPostMetrics(brandId, 200),
      generateSuggestions(brandId),
    ]);

    if (!brand) return { error: "Brand not found." };
    if (connections.length === 0) return { error: "Connect an account before generating a plan." };
    if (!suggestResult || suggestResult.suggestions.length === 0) {
      return { error: "Not enough data yet to generate a plan. Publish a few posts first." };
    }

    // Only the create suggestions become drafts (retire ideas aren't posts).
    const ideas = suggestResult.suggestions.filter((s) => s.kind === "create").slice(0, 5);
    if (ideas.length === 0) return { error: "No new-post ideas to schedule right now." };

    const platform = connections[0]!.platform;
    const slots = bestTimeSlots(toTimings(metrics), platform);
    const times = nextWeekSlots(slots, ideas.length);
    const platforms = [...new Set(connections.map((c) => c.platform))] as Platform[];

    await Promise.all(
      ideas.map((idea, i) => {
        const variants: PostVariants = {};
        const caption = `${idea.title}\n\n${idea.action}`;
        if (platforms.includes("fb")) variants.facebook = { caption, mediaAssetIds: [] };
        if (platforms.includes("ig")) variants.instagram = { caption, mediaAssetIds: [] };

        return createPost({
          brandId,
          workspaceId,
          createdBy: session.uid,
          status: "draft",
          scheduledAt: times[i],
          variants,
          aiMeta: {
            suggested: true,
            predictedScore: idea.predictedScore,
            reasoning: `${idea.signal} ${idea.why}`,
          },
        });
      }),
    );

    revalidatePath("/planner");
    return { created: ideas.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the plan." };
  }
}

/** Build best-time timing samples from stored post metrics. */
function toTimings(metrics: { publishedAt: string; intentScore: number }[]): PostTiming[] {
  return metrics.map((m) => {
    const d = new Date(m.publishedAt);
    return { weekday: d.getDay(), hour: d.getHours(), intentScore: m.intentScore };
  });
}

/**
 * Map the top-3 recurring weekly slots onto concrete dates in the coming 7 days,
 * cycling through the slots so 5 ideas spread across the week.
 */
function nextWeekSlots(slots: { weekday: number; hour: number }[], count: number): string[] {
  const now = new Date();
  const result: string[] = [];

  for (let i = 0; i < count; i++) {
    const slot = slots[i % slots.length]!;
    const date = new Date(now);
    // Days until the slot's weekday (at least tomorrow), offset by a week per cycle.
    let delta = (slot.weekday - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    delta += Math.floor(i / slots.length) * 7;
    date.setDate(now.getDate() + delta);
    date.setHours(slot.hour, 0, 0, 0);
    result.push(date.toISOString());
  }

  return result;
}
