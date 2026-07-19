import "server-only";

import { z } from "zod";

import type { Platform } from "@/types";

import { generateStructured } from "../llm";

/**
 * Planner AI suggestion tab — turns a plain-language "here's what I want to post"
 * into several ready-to-post caption options, and paraphrases an existing line
 * into fresh variants.
 *
 * Backs the Composer's fourth variant tab (`/api/ai/content-suggest`,
 * `/api/ai/paraphrase`). Both honour the build rule "no bare suggestion": every
 * caption carries its `angle`, every paraphrase its `note` on what changed — so
 * the writer can reason about a pick, never just accept a blind rewrite.
 */

const PLATFORM_GUIDANCE: Record<Platform, string> = {
  ig: "Instagram: a strong first line (the hook shown before 'more'), line breaks for scannability, a light call to save or share, 3–8 relevant hashtags. Emoji sparingly.",
  fb: "Facebook: slightly longer form is fine, conversational, a clear call to action or a question to drive comments. Few or no hashtags — they underperform on FB.",
};

/* ------------------------------------------------------------------ *
 * Content suggestions — at least 3 distinct captions from one idea.
 * ------------------------------------------------------------------ */

export const contentSuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        caption: z.string(),
        angle: z.string(),
      }),
    )
    .min(3)
    .max(5),
});

export type ContentSuggestionResult = z.infer<typeof contentSuggestionSchema>;

const contentSuggestionJsonSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      description: "At least 3 distinct caption options, each taking a different angle.",
      items: {
        type: "object",
        properties: {
          caption: { type: "string", description: "The caption text, ready to post." },
          angle: {
            type: "string",
            description:
              "One short line on the hook/angle this option takes and why it could land.",
          },
        },
        required: ["caption", "angle"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

/**
 * Generate at least 3 caption options for a described post. Each is a genuinely
 * different take (different hook/structure/CTA) so the writer has real choice,
 * not three rewordings of one line.
 */
export async function suggestPlannerContent(input: {
  idea: string;
  platform: Platform;
  brandVoice?: string;
}): Promise<ContentSuggestionResult> {
  const { idea, platform, brandVoice } = input;

  const system = [
    "You write high-performing social captions for a social media agency.",
    "Return concrete, ready-to-post captions — never placeholders or bracketed fill-ins.",
    "Give AT LEAST 3 options, and make each one a genuinely different angle — vary the hook, the structure and the call to action so the writer has real choice.",
    brandVoice ? `Brand voice: ${brandVoice}` : "Match a warm, credible, non-salesy brand voice.",
    PLATFORM_GUIDANCE[platform],
  ].join("\n");

  return generateStructured({
    system,
    prompt: `Write at least 3 distinct caption options for this post idea:\n\n${idea}`,
    schema: contentSuggestionSchema,
    jsonSchema: contentSuggestionJsonSchema,
    maxTokens: 1800,
  });
}

/* ------------------------------------------------------------------ *
 * Paraphrase — rewrite one line into several variants.
 * ------------------------------------------------------------------ */

export const paraphraseSchema = z.object({
  variants: z
    .array(
      z.object({
        text: z.string(),
        note: z.string(),
      }),
    )
    .min(3)
    .max(5),
});

export type ParaphraseResult = z.infer<typeof paraphraseSchema>;

const paraphraseJsonSchema = {
  type: "object",
  properties: {
    variants: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      description: "At least 3 paraphrased rewrites of the original, each in a different register.",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The rewritten line, ready to post." },
          note: {
            type: "string",
            description: "One short line on how this rewrite differs (tone, length, emphasis).",
          },
        },
        required: ["text", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["variants"],
  additionalProperties: false,
};

/**
 * Paraphrase a caption/sentence into at least 3 variants that keep the meaning
 * but change the delivery (punchier, warmer, more formal…). Each ships a `note`
 * so the writer knows what they're picking.
 */
export async function paraphraseContent(input: {
  text: string;
  platform: Platform;
  brandVoice?: string;
}): Promise<ParaphraseResult> {
  const { text, platform, brandVoice } = input;

  const system = [
    "You are a copy editor for a social media agency.",
    "Rewrite the user's text into at least 3 paraphrased variants that preserve the meaning but vary the delivery — punchier, warmer, more formal, shorter, etc.",
    "Keep every variant ready to post. Never add bracketed placeholders.",
    brandVoice ? `Brand voice: ${brandVoice}` : "Match a warm, credible, non-salesy brand voice.",
    PLATFORM_GUIDANCE[platform],
  ].join("\n");

  return generateStructured({
    system,
    prompt: `Paraphrase this into at least 3 distinct variants:\n\n${text}`,
    schema: paraphraseSchema,
    jsonSchema: paraphraseJsonSchema,
    maxTokens: 1500,
  });
}
