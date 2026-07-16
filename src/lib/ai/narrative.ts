import "server-only";

import { z } from "zod";

import { generateStructured, isAiConfigured } from "../claude";
import type { ReportBrandSnapshot, ReportNarrative } from "@/types";

/**
 * Report narrative — Claude explains what the numbers mean, in the plain,
 * client-facing voice an agency would use in a monthly review.
 *
 * Grounded exactly like the rest of the AI surface: `renderSnapshot` emits ONLY
 * numbers that exist in the stored snapshot, and the system prompt forbids citing
 * anything else, so the narrative can't invent a metric the brand doesn't have.
 * Per the architecture rules every recommendation ships its `reason` — a bare
 * "post more Reels" is rejected by the schema.
 */

const schema = z.object({
  summary: z.string(),
  recommendations: z
    .array(z.object({ text: z.string(), reason: z.string() }))
    .min(1)
    .max(4),
});

const jsonSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "2-4 sentences of plain-English narrative for the client: what changed this period and why it matters. Cite only numbers from the data.",
    },
    recommendations: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The recommended action." },
          reason: {
            type: "string",
            description: "The specific number(s) from the data that justify it.",
          },
        },
        required: ["text", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "recommendations"],
  additionalProperties: false,
};

/**
 * Generate the narrative for a report's snapshot. Returns null when AI is
 * unconfigured or there's no data to narrate — the report renders its numbers
 * without a narrative rather than fabricating one.
 */
export async function generateNarrative(
  snapshot: ReportBrandSnapshot[],
  periodLabel: string,
): Promise<ReportNarrative | null> {
  if (!isAiConfigured()) return null;
  const rendered = renderSnapshot(snapshot);
  if (!rendered) return null;

  try {
    return await generateStructured({
      system:
        "You write the narrative section of a social media performance report for an agency's client. Be concrete, honest, and plain — no hype, no jargon. Explain what changed and why, then recommend next steps. Use ONLY the numbers provided; never invent a metric or a figure not shown.",
      prompt: `Reporting period: ${periodLabel}\n\n${rendered}\n\nWrite the client-facing narrative summary and 1-4 recommendations. Every recommendation must cite the specific numbers above that justify it.`,
      schema,
      jsonSchema,
      maxTokens: 900,
    });
  } catch {
    return null;
  }
}

/**
 * Render the snapshot as a grounding block. Emits only present numbers, so a
 * brand missing (say) follower data simply has no follower line for the model
 * to cite. Returns null if nothing measurable is present at all.
 */
export function renderSnapshot(snapshot: ReportBrandSnapshot[]): string | null {
  const blocks: string[] = [];

  for (const b of snapshot) {
    const lines: string[] = [`Brand: ${b.brandName}`];
    if (b.followers !== null) lines.push(`Followers: ${b.followers.toLocaleString()}`);
    if (b.reach !== null) {
      const delta =
        b.reachDeltaPct !== null ? ` (${signed(b.reachDeltaPct)}% vs prior window)` : "";
      lines.push(`Reach this period: ${b.reach.toLocaleString()}${delta}`);
    }
    if (b.avgIntent !== null) lines.push(`Average intent score: ${b.avgIntent}`);

    if (b.topPosts.length) {
      lines.push("Top posts (best intent first):");
      for (const p of b.topPosts) {
        const parts = [
          `- "${p.title}"`,
          `[${p.format}, ${p.platform}]`,
          `intent ${p.intentScore}`,
          `reach ${p.reach.toLocaleString()}`,
          p.saves !== undefined ? `saves ${p.saves}` : null,
          `shares ${p.shares}`,
        ].filter(Boolean);
        lines.push(parts.join(" · "));
      }
    }

    if (b.smartlinkClicks.length) {
      lines.push(
        "SmartLink clicks attributed to posts: " +
          b.smartlinkClicks.map((c) => `"${c.postTitle}" ${c.clicks}`).join(", "),
      );
    }

    // A brand with only its name and no metrics contributes nothing to narrate.
    if (lines.length > 1) blocks.push(lines.join("\n"));
  }

  return blocks.length ? blocks.join("\n\n") : null;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
