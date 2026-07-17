import "server-only";

import { z } from "zod";

import { generateStructured } from "../llm";
import { buildBrandDataPack, renderDataPack } from "./brand-context";

/**
 * Content suggestions — 3 scored next-post ideas, each with a visible reasoning
 * chain {signal, why, action}.
 *
 * Grounded: the prompt is the brand's real data pack, and the system prompt
 * forbids citing any number not present in it. This is what the Phase 4 exit
 * criterion checks — "reasoning cites actual numbers". A suggestion whose
 * `signal` references a metric the brand doesn't have would be a bug, not just
 * a style issue, so the schema makes every field of the chain required.
 */

export const suggestionSchema = z.object({
  format: z.string(),
  platforms: z.string(),
  title: z.string(),
  signal: z.string(),
  why: z.string(),
  action: z.string(),
  predictedScore: z.number().int().min(0).max(100),
  /** "retire" flags an underperforming series to pause; "create" is a new idea. */
  kind: z.enum(["create", "retire"]),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

const resultSchema = z.object({ suggestions: z.array(suggestionSchema).min(1).max(3) });
export type SuggestResult = z.infer<typeof resultSchema>;

const jsonSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          format: {
            type: "string",
            description: 'e.g. "Carousel · IG + FB", "Reel · IG", "Static → retire"',
          },
          platforms: { type: "string", description: 'e.g. "IG + FB", "IG"' },
          title: { type: "string", description: "The concrete post idea, as a headline." },
          signal: {
            type: "string",
            description:
              "The specific data signal that motivates this — cite a real number from the pack.",
          },
          why: {
            type: "string",
            description: "Why that signal matters for reach/intent right now.",
          },
          action: { type: "string", description: "The concrete next step (format, hook, timing)." },
          predictedScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "Predicted intent score.",
          },
          kind: { type: "string", enum: ["create", "retire"] },
        },
        required: [
          "format",
          "platforms",
          "title",
          "signal",
          "why",
          "action",
          "predictedScore",
          "kind",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

const SYSTEM = [
  "You are a social strategist proposing a brand's next posts, grounded ENTIRELY in the performance data provided.",
  "Rules:",
  "- Every `signal` MUST cite a specific number from the data (a format's avg intent, a save count, a reach figure). Never invent a number that isn't in the data.",
  "- Prefer formats and topics the data shows working for THIS brand.",
  "- If a series or format is clearly underperforming, include one suggestion with kind 'retire' recommending pausing or converting it.",
  "- predictedScore should reflect how the idea compares to the brand's own averages.",
  "- Never output a suggestion without its full signal→why→action reasoning chain.",
].join("\n");

/**
 * Generate up to 3 grounded suggestions. Returns null when the brand has no
 * synced data yet — a suggestion needs evidence, and inventing one would violate
 * the grounding contract.
 */
export async function generateSuggestions(brandId: string): Promise<SuggestResult | null> {
  const pack = await buildBrandDataPack(brandId);
  if (!pack || !pack.hasData) return null;

  return generateStructured({
    system: SYSTEM,
    prompt: `${renderDataPack(pack)}\n\nPropose up to 3 next posts. Ground every suggestion in the numbers above.`,
    schema: resultSchema,
    jsonSchema,
    maxTokens: 1800,
  });
}
