import "server-only";

import { z } from "zod";

import { generateStructured, isAiConfigured } from "../claude";
import type { Sentiment } from "@/types";

/**
 * Comment sentiment classification for the Inbox.
 *
 * Classes: positive | neutral | negative | lead. The `lead` class is the
 * important one — a purchase-intent question ("is this still available?", "how
 * much?") is a sales opportunity, not just a positive comment, and the Inbox
 * filters Leads separately.
 *
 * Batched: one Claude call classifies many comments, so a sync pulling 30 new
 * comments is one request, not 30.
 */

const resultSchema = z.object({
  labels: z.array(z.enum(["positive", "neutral", "negative", "lead"])),
});

const jsonSchema = {
  type: "object",
  properties: {
    labels: {
      type: "array",
      items: { type: "string", enum: ["positive", "neutral", "negative", "lead"] },
      description: "One label per input comment, in the same order.",
    },
  },
  required: ["labels"],
  additionalProperties: false,
};

const SYSTEM = [
  "You classify social media comments for a brand's inbox.",
  "Classes:",
  "- lead: shows purchase or booking intent — asking availability, price, how to buy/book, wanting a viewing/quote. This takes priority over positive.",
  "- negative: a complaint, frustration, or something needing careful handling.",
  "- positive: praise or friendly engagement with no buying intent.",
  "- neutral: everything else.",
  "Return exactly one label per comment, in the same order as given.",
].join("\n");

/**
 * Classify a batch of comments. Returns labels aligned to the input order.
 *
 * Falls back to all-neutral when AI is unconfigured or the response is
 * misaligned — an inbox item with a wrong-but-present sentiment is better than a
 * failed sync. The count-mismatch guard matters: if Claude returns fewer labels
 * than comments, aligning by index would mislabel the tail.
 */
export async function classifySentiments(comments: string[]): Promise<Sentiment[]> {
  if (comments.length === 0) return [];
  if (!isAiConfigured()) return comments.map(() => "neutral");

  try {
    const numbered = comments.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const result = await generateStructured({
      system: SYSTEM,
      prompt: `Classify these ${comments.length} comments:\n\n${numbered}`,
      schema: resultSchema,
      jsonSchema,
      maxTokens: 500,
    });

    if (result.labels.length !== comments.length) {
      // Misaligned — don't risk mislabelling; default the batch to neutral.
      return comments.map(() => "neutral");
    }
    return result.labels;
  } catch {
    return comments.map(() => "neutral");
  }
}
