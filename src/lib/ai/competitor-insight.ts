import "server-only";

import { z } from "zod";

import { generateStructured, isAiConfigured } from "../claude";

/**
 * Competitor comparison insight — the one-line "what this means" under the table.
 *
 * Grounded exactly like the rest of the AI surface: the comparison is rendered as
 * plain numbers and the model is told to cite only those. The insight names a
 * specific contrast (e.g. "posts more but earns less engagement") — an
 * observation with its evidence, never a bare claim.
 */

export interface CompetitorRow {
  /** Present for tracked competitors; absent for the user's own row. */
  competitorId?: string;
  name: string;
  isYou: boolean;
  followers: number;
  growth30dPct: number | null;
  postsPerWeek: number;
  avgEngagementRatePct: number;
}

const schema = z.object({ insight: z.string() });

const jsonSchema = {
  type: "object",
  properties: {
    insight: {
      type: "string",
      description:
        "1-2 sentences comparing the user's account to the competitors, citing specific numbers from the table. Name a concrete contrast and what it implies for strategy.",
    },
  },
  required: ["insight"],
  additionalProperties: false,
};

export async function generateCompetitorInsight(rows: CompetitorRow[]): Promise<string | null> {
  if (!isAiConfigured()) return null;
  const you = rows.find((r) => r.isYou);
  const others = rows.filter((r) => !r.isYou);
  if (!you || others.length === 0) return null;

  try {
    const result = await generateStructured({
      system:
        "You analyse a brand's social performance against competitors, using ONLY the public numbers provided. Be sharp and specific — name the real contrast, not a platitude. Never invent a figure that isn't in the table.",
      prompt: `${renderRows(rows)}\n\nWrite one insight comparing "${you.name}" (the user) to the others. Cite specific numbers.`,
      schema,
      jsonSchema,
      maxTokens: 300,
    });
    return result.insight;
  } catch {
    return null;
  }
}

function renderRows(rows: CompetitorRow[]): string {
  const lines = rows.map((r) => {
    const growth =
      r.growth30dPct === null ? "n/a" : `${r.growth30dPct > 0 ? "+" : ""}${r.growth30dPct}%`;
    return `- ${r.name}${r.isYou ? " (you)" : ""}: ${r.followers.toLocaleString()} followers, 30d growth ${growth}, ${r.postsPerWeek.toFixed(1)} posts/wk, ${r.avgEngagementRatePct.toFixed(1)}% avg engagement`;
  });
  return `Accounts:\n${lines.join("\n")}`;
}
