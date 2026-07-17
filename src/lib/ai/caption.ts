import "server-only";

import { z } from "zod";

import type { Platform } from "@/types";

import { generateStructured } from "../llm";

/**
 * Caption generation — platform-tuned caption options + hashtag suggestions.
 *
 * Backs the Composer's hashtag chips (`/api/ai/caption`). Even here, every
 * option carries an `angle` explaining what it's going for — the build rule is
 * "no bare suggestion", and a caption the user can't reason about is a bare one.
 */

export const captionResultSchema = z.object({
  options: z
    .array(
      z.object({
        caption: z.string(),
        angle: z.string(),
      }),
    )
    .min(1)
    .max(3),
  hashtags: z.array(z.string()).max(12),
});

export type CaptionResult = z.infer<typeof captionResultSchema>;

/** JSON Schema mirror of the zod shape, for the Claude tool definition. */
const captionJsonSchema = {
  type: "object",
  properties: {
    options: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          caption: { type: "string", description: "The caption text, ready to post." },
          angle: {
            type: "string",
            description: "One short line on the hook/angle this caption takes.",
          },
        },
        required: ["caption", "angle"],
        additionalProperties: false,
      },
    },
    hashtags: {
      type: "array",
      maxItems: 12,
      items: { type: "string", description: "A single hashtag including the # prefix." },
    },
  },
  required: ["options", "hashtags"],
  additionalProperties: false,
};

const PLATFORM_GUIDANCE: Record<Platform, string> = {
  ig: "Instagram: a strong first line (the hook shown before 'more'), line breaks for scannability, a light call to save or share, 3–8 relevant hashtags. Emoji sparingly.",
  fb: "Facebook: slightly longer form is fine, conversational, a clear call to action or a question to drive comments. Few or no hashtags — they underperform on FB.",
};

export async function generateCaption(input: {
  idea: string;
  platform: Platform;
  brandVoice?: string;
}): Promise<CaptionResult> {
  const { idea, platform, brandVoice } = input;

  const system = [
    "You write high-performing social captions for a social media agency.",
    "Return concrete, ready-to-post captions — never placeholders or bracketed fill-ins.",
    brandVoice ? `Brand voice: ${brandVoice}` : "Match a warm, credible, non-salesy brand voice.",
    PLATFORM_GUIDANCE[platform],
  ].join("\n");

  return generateStructured({
    system,
    prompt: `Write up to 3 caption options and suggest hashtags for this post idea:\n\n${idea}`,
    schema: captionResultSchema,
    jsonSchema: captionJsonSchema,
  });
}
