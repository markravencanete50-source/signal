import "server-only";

import { z } from "zod";

import { adminDb } from "../firebase-admin";
import { generateStructured, isAiConfigured } from "../claude";
import { getRecentCaptions } from "../db/posts";

/**
 * Niche-coherence engine.
 *
 * Claude reads the brand's last 12 post captions and scores how clearly the feed
 * reads as one niche (0–100), naming which posts drift off-topic. Meta's ranking
 * weights topic clarity, so a scattered feed gets less recommendation reach —
 * this surfaces that.
 *
 * Cached per brand per day (`coherenceScores/{brandId}_{date}`, DECISIONS #015):
 * the score barely moves within a day and each call costs a Claude request, so
 * the cache caps it at one call per brand per day.
 */

const COLLECTION = "coherenceScores";

export interface CoherenceResult {
  score: number;
  reasoning: string;
  driftNote: string | null;
}

const schema = z.object({
  score: z.number().int().min(0).max(100),
  reasoning: z.string(),
  driftNote: z.string().nullable(),
});

const jsonSchema = {
  type: "object",
  properties: {
    score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "How clearly the feed reads as one niche. 85+ = tight, <60 = scattered.",
    },
    reasoning: { type: "string", description: "One or two sentences naming the niche you read." },
    driftNote: {
      type: ["string", "null"],
      description: "Which post(s) drift off-niche, or null if the feed is consistent.",
    },
  },
  required: ["score", "reasoning", "driftNote"],
  additionalProperties: false,
};

/**
 * Coherence for a brand, cached per day. Returns null when AI is unconfigured or
 * the brand has too few posts to judge — the views hide the ring in that case
 * rather than showing a meaningless number.
 */
export async function getCoherence(
  brandId: string,
  workspaceId: string,
): Promise<CoherenceResult | null> {
  const today = new Date().toISOString().slice(0, 10);
  const cacheRef = adminDb().doc(`${COLLECTION}/${brandId}_${today}`);

  const cached = await cacheRef.get();
  if (cached.exists) return cached.data() as CoherenceResult;

  if (!isAiConfigured()) return null;

  const captions = await getRecentCaptions(brandId, 12);
  // Below a handful of posts there's no feed to judge coherence of.
  if (captions.length < 3) return null;

  try {
    const result = await generateStructured({
      system:
        "You assess how clearly a brand's social feed reads as a single niche. Meta's algorithm rewards topic clarity — a feed that jumps between unrelated topics gets less recommendation reach. Judge only from the captions given.",
      prompt: `Here are the brand's last ${captions.length} post captions, newest first:\n\n${captions
        .map((c, i) => `${i + 1}. ${c}`)
        .join("\n\n")}\n\nScore the niche coherence and note any drift.`,
      schema,
      jsonSchema,
      maxTokens: 500,
    });

    // Cache for the rest of the day. workspaceId is stored so rules can scope reads.
    await cacheRef.set({ ...result, brandId, workspaceId, computedAt: new Date().toISOString() });
    return result;
  } catch {
    return null;
  }
}
