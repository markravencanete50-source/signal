import "server-only";

import { z } from "zod";

import type { Sentiment } from "@/types";

import { generateStructured } from "../claude";

/**
 * Inbox reply suggestions — a draft response to a comment or mention, in the
 * brand's own voice.
 *
 * Grounded in the brand's recent captions (its actual voice) and the specific
 * message, so the draft sounds like the brand rather than a generic bot. Per the
 * "no bare suggestion" rule it ships `reasoning`: why this approach — which the
 * writer reads before deciding whether to send, edit, or bin it.
 */

const schema = z.object({
  reply: z.string(),
  reasoning: z.string(),
});

const jsonSchema = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "The suggested reply, ready to send. Match the brand's voice; keep it concise.",
    },
    reasoning: {
      type: "string",
      description: "One line on the approach — the tone/strategy and why it fits this message.",
    },
  },
  required: ["reply", "reasoning"],
  additionalProperties: false,
};

export interface ReplySuggestion {
  reply: string;
  reasoning: string;
}

const SENTIMENT_GUIDANCE: Record<Sentiment, string> = {
  lead: "This is a potential customer. Be warm, answer the question, and move them toward a concrete next step (a viewing, a call, a DM).",
  negative:
    "This person is unhappy. Acknowledge the issue sincerely, avoid defensiveness, and offer a specific next step to put it right. Never argue in public.",
  positive: "This is positive. Be genuine and appreciative; keep it human, not corporate.",
  neutral: "Answer helpfully and briefly in a friendly, on-brand tone.",
};

/**
 * Draft a reply to an inbox message. Returns null when AI is unconfigured — the
 * Inbox still lets the writer type a reply by hand.
 */
export async function suggestReply(params: {
  brandName: string;
  voiceSamples: string[];
  authorName: string;
  message: string;
  sentiment: Sentiment;
}): Promise<ReplySuggestion | null> {
  const voice = params.voiceSamples.length
    ? `Here are recent posts from ${params.brandName}, to match its voice:\n\n${params.voiceSamples
        .map((c, i) => `${i + 1}. ${c}`)
        .join("\n")}`
    : `Write in a friendly, professional voice for ${params.brandName}.`;

  try {
    return await generateStructured({
      system:
        "You draft replies to social media comments and DMs on behalf of a brand's social team. Sound like a real person from the brand, never like a bot. Use only what the message tells you — don't invent facts, prices, or promises the brand hasn't made. If a detail is needed to answer properly, say you'll follow up rather than making one up.",
      prompt: `${voice}\n\nA message from ${params.authorName}:\n"${params.message}"\n\n${SENTIMENT_GUIDANCE[params.sentiment]}\n\nDraft a reply and explain your approach in one line.`,
      schema,
      jsonSchema,
      maxTokens: 500,
    });
  } catch {
    return null;
  }
}
