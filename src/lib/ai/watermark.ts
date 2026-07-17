import "server-only";

import { z } from "zod";

import { AiUnavailableError, generateVisionStructured, isAiConfigured } from "../llm";

/**
 * Native-format guard — watermark detection via LLM vision.
 *
 * Recycled TikTok/CapCut content is down-ranked by Meta, so on video upload we
 * extract a frame and ask a vision model whether it carries one of those
 * watermarks. If so, the media library re-exports a cropped version (Cloudinary)
 * and publishes that instead.
 *
 * Returns `{ detected: false }` silently when AI isn't configured OR the vision
 * check fails — the guard is an enhancement, not a gate; upload still succeeds
 * without it, and free vision models are best-effort.
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

export async function detectWatermark(frameUrl: string): Promise<WatermarkDetection> {
  if (!isAiConfigured()) {
    // No key → assume clean. The upload proceeds; nothing is falsely stripped.
    return { detected: false, source: "none", reasoning: "AI not configured; guard skipped." };
  }

  try {
    return await generateVisionStructured({
      system:
        "You inspect a single video frame for recycled-content watermarks. Look specifically for the TikTok logo/username watermark or the CapCut logo, usually in a corner or moving across the frame. Report only what is actually visible.",
      prompt: "Does this frame carry a TikTok or CapCut watermark?",
      imageUrl: frameUrl,
      schema: detectionSchema,
      jsonSchema: detectionJsonSchema,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { detected: false, source: "none", reasoning: "AI not configured; guard skipped." };
    }
    // A vision failure must not block the upload — treat as clean and move on.
    return { detected: false, source: "none", reasoning: "Guard check failed; treated as clean." };
  }
}
