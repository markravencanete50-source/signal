import "server-only";

import { z } from "zod";

import type { Platform } from "@/types";

import { generateStructured } from "../claude";

/**
 * Predicted intent score — backs the Composer's score ring (`/api/ai/score`).
 *
 * Returns a 0–100 predicted intent score plus a `reasoning` line and ONE
 * concrete improvement. The build spec is explicit: `/api/ai/score` returns
 * "predicted intent score + one concrete improvement" — never a bare number.
 * The zod schema makes `reasoning` and `improvement` non-optional so a bare
 * score can't escape this function.
 */

export const scoreResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasoning: z.string(),
  improvement: z.string(),
});

export type ScoreResult = z.infer<typeof scoreResultSchema>;

const scoreJsonSchema = {
  type: "object",
  properties: {
    score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "Predicted intent score: likelihood this drives saves/shares/comments.",
    },
    reasoning: {
      type: "string",
      description: "One or two sentences on why this scores where it does.",
    },
    improvement: {
      type: "string",
      description: "One concrete, specific change that would raise the score.",
    },
  },
  required: ["score", "reasoning", "improvement"],
  additionalProperties: false,
};

export async function scoreDraft(input: {
  caption: string;
  platform: Platform;
  hasMedia: boolean;
  format?: "image" | "video" | "carousel";
  brandVoice?: string;
}): Promise<ScoreResult> {
  const { caption, platform, hasMedia, format, brandVoice } = input;

  const system = [
    "You predict how well a social post will perform on intent signals: saves, shares, comments, and profile clicks — NOT vanity likes.",
    "Instagram's 2026 ranking weights saves, DM shares and watch time highest. Facebook rewards comments and shares.",
    "Score conservatively and specifically. A generic post scores 40–55; a strong hook with a save-worthy payload scores 75+.",
    brandVoice ? `Brand voice: ${brandVoice}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const draft = [
    `Platform: ${platform === "ig" ? "Instagram" : "Facebook"}`,
    `Media: ${hasMedia ? (format ?? "attached") : "none (text only)"}`,
    "",
    "Caption:",
    caption || "(empty)",
  ].join("\n");

  return generateStructured({
    system,
    prompt: `Predict the intent score for this draft, and give one concrete improvement:\n\n${draft}`,
    schema: scoreResultSchema,
    jsonSchema: scoreJsonSchema,
    maxTokens: 600,
  });
}
