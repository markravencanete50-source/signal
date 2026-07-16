import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { isAiConfigured } from "../claude";
import { buildBrandDataPack, renderDataPack, type BrandDataPack } from "./brand-context";

/**
 * Ask Signal — grounded Q&A over a brand's own data, streamed.
 *
 * The system prompt is strict: answer only from the supplied data, cite the
 * numbers, and if the question can't be answered from that data, SAY SO rather
 * than invent. The Phase 4 exit criterion checks both directions — it answers
 * reach/next-post/comparison questions from real data AND declines out-of-data
 * ones.
 *
 * Returns a token stream (ReadableStream<string>) that the route pipes to the
 * client, so answers appear incrementally like the preview's chat.
 */

const SYSTEM_HEADER = [
  "You are Signal's in-app analyst. You answer a user's questions about their brand's social performance, using ONLY the data provided below.",
  "Hard rules:",
  "- Cite specific numbers from the data when they support your answer.",
  "- If the data doesn't contain what's needed to answer, say so plainly (e.g. \"I don't have that in your synced data yet\") and suggest what would let you answer. NEVER invent a number.",
  "- Be concise and plain-language. Show your reasoning briefly, but don't pad.",
  "- You can reason about the numbers (compare formats, explain a reach change) as long as every figure you state appears in the data.",
].join("\n");

export class AskUnavailable extends Error {}

/**
 * Stream a grounded answer. Throws AskUnavailable when AI isn't configured (the
 * route turns that into a friendly message) or the brand has no data pack.
 */
export async function askSignalStream(
  brandId: string,
  question: string,
): Promise<ReadableStream<string>> {
  if (!isAiConfigured()) throw new AskUnavailable("AI is not configured.");

  const pack = await buildBrandDataPack(brandId);
  if (!pack) throw new AskUnavailable("No data for this brand.");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = `${SYSTEM_HEADER}\n\n--- YOUR BRAND'S DATA ---\n${dataOrEmpty(pack)}`;

  // messages.stream yields events; we forward only text deltas as plain strings.
  const anthropicStream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: question }],
  });

  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(event.delta.text);
          }
        }
      } catch (err) {
        controller.enqueue(
          err instanceof Error
            ? `\n\n(Sorry — I hit an error: ${err.message})`
            : "\n\n(Sorry — I hit an error.)",
        );
      } finally {
        controller.close();
      }
    },
  });
}

/** When the brand has synced nothing yet, tell the model that explicitly. */
function dataOrEmpty(pack: BrandDataPack): string {
  if (!pack.hasData) {
    return `Brand: ${pack.brand.name}\n(No metrics have synced yet — there is no performance data to answer from.)`;
  }
  return renderDataPack(pack);
}
