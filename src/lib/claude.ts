import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Claude client + typed helpers.
 *
 * The single choke point for Anthropic API calls (mirrors how `adapters/` is the
 * only place that touches the Graph API). `lib/ai/*` builds prompts and calls
 * these helpers; nothing else imports the SDK.
 *
 * All calls are server-side only — the key never reaches a browser. Lazily
 * constructed so a build without ANTHROPIC_API_KEY still compiles.
 */

/** Default model. Per repo convention, the current Opus tier. */
const MODEL = "claude-opus-4-8";

let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function anthropic(): Anthropic {
  if (!isAiConfigured()) {
    throw new AiUnavailableError();
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Thrown when the AI key is absent. Callers catch this to degrade gracefully —
 * the Composer still works without predicted scores, it just doesn't show them.
 * Distinct from a real API failure so the UI can tell "not set up" from "broke".
 */
export class AiUnavailableError extends Error {
  constructor() {
    super("AI features are not configured (ANTHROPIC_API_KEY is unset).");
    this.name = "AiUnavailableError";
  }
}

/**
 * Run a prompt and validate the JSON response against a zod schema.
 *
 * Forces a tool call whose input schema is the caller's shape, which is the
 * reliable way to get structured output back — the model must return an object
 * matching the schema rather than prose we'd have to parse out of a code fence.
 * The zod parse is the backstop: a malformed tool input throws here rather than
 * flowing on as a half-valid object.
 */
export async function generateStructured<T>(params: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const { system, prompt, schema, jsonSchema, maxTokens = 1500 } = params;

  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    tools: [
      {
        name: "respond",
        description: "Return the structured response.",
        input_schema: jsonSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "respond" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured response.");
  }

  return schema.parse(toolUse.input);
}
