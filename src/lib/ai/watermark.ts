import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { AiUnavailableError, isAiConfigured } from "../claude";

/**
 * Native-format guard — watermark detection via Claude vision.
 *
 * Recycled TikTok/CapCut content is down-ranked by Meta, so on video upload we
 * extract a frame and ask Claude whether it carries one of those watermarks. If
 * so, the media library re-exports a cropped version (Cloudinary) and publishes
 * that instead.
 *
 * Returns `{ detected: false }` silently when AI isn't configured — the guard is
 * an enhancement, not a gate; upload still succeeds without it.
 */

const detectionSchema = z.object({
  detected: z.boolean(),
  source: z.enum(["tiktok", "capcut", "other", "none"]),
  reasoning: z.string(),
});

export type WatermarkDetection = z.infer<typeof detectionSchema>;

const detectionJsonSchema = {
  type: "object",
  properties: {
    detected: { type: "boolean", description: "True if a platform watermark/logo is visible." },
    source: {
      type: "string",
      enum: ["tiktok", "capcut", "other", "none"],
      description: "Which watermark, if any.",
    },
    reasoning: { type: "string", description: "One line on what you saw." },
  },
  required: ["detected", "source", "reasoning"],
  additionalProperties: false,
};

let client: Anthropic | null = null;

export async function detectWatermark(frameUrl: string): Promise<WatermarkDetection> {
  if (!isAiConfigured()) {
    // No key → assume clean. The upload proceeds; nothing is falsely stripped.
    return { detected: false, source: "none", reasoning: "AI not configured; guard skipped." };
  }

  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 400,
      system:
        "You inspect a single video frame for recycled-content watermarks. Look specifically for the TikTok logo/username watermark or the CapCut logo, usually in a corner or moving across the frame. Report only what is actually visible.",
      tools: [
        {
          name: "report",
          description: "Report the watermark finding.",
          input_schema: detectionJsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "report" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: frameUrl } },
            { type: "text", text: "Does this frame carry a TikTok or CapCut watermark?" },
          ],
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { detected: false, source: "none", reasoning: "No structured response." };
    }
    return detectionSchema.parse(toolUse.input);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { detected: false, source: "none", reasoning: "AI not configured; guard skipped." };
    }
    // A vision failure must not block the upload — treat as clean and move on.
    return { detected: false, source: "none", reasoning: "Guard check failed; treated as clean." };
  }
}
