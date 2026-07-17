import "server-only";

import OpenAI from "openai";
import { z } from "zod";

/**
 * LLM client + typed helpers.
 *
 * The single choke point for LLM API calls (mirrors how `adapters/` is the only
 * place that touches the Graph API). `lib/ai/*` builds prompts and calls these
 * helpers; nothing else imports the SDK.
 *
 * Provider: Groq primary, OpenRouter fallback. Both speak the OpenAI protocol,
 * so a single `openai` client drives both — only the base URL, key and model id
 * differ. Every call runs through `withFallback`, which tries each configured
 * provider in order: if Groq is rate-limited or errors (its free-tier daily
 * token cap is low), the same request is retried against OpenRouter.
 *
 * All calls are server-side only — the keys never reach a browser. Lazily
 * constructed so a build without any AI key still compiles, and the whole app
 * degrades gracefully (see `isAiConfigured`).
 */

/** Groq's OpenAI-compatible endpoint and default model. */
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

/** OpenRouter's OpenAI-compatible endpoint and free-tier fallback models. */
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const OPENROUTER_VISION_MODEL = "meta-llama/llama-3.2-11b-vision-instruct:free";

type Provider = {
  name: string;
  client: OpenAI;
  model: string;
  visionModel: string;
};

let groqClient: OpenAI | null = null;
let openrouterClient: OpenAI | null = null;

function groq(): OpenAI {
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: GROQ_BASE_URL,
    });
  }
  return groqClient;
}

function openrouter(): OpenAI {
  if (!openrouterClient) {
    openrouterClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
    });
  }
  return openrouterClient;
}

/**
 * The configured providers, in fallback order. Groq first (fast, generous RPM),
 * OpenRouter second (survives Groq's daily token cap). An empty list means no AI
 * key is set — callers see `AiUnavailableError` and degrade.
 */
function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.GROQ_API_KEY) {
    list.push({ name: "groq", client: groq(), model: GROQ_MODEL, visionModel: GROQ_VISION_MODEL });
  }
  if (process.env.OPENROUTER_API_KEY) {
    list.push({
      name: "openrouter",
      client: openrouter(),
      model: OPENROUTER_MODEL,
      visionModel: OPENROUTER_VISION_MODEL,
    });
  }
  return list;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
}

/**
 * Thrown when no AI key is set. Callers catch this to degrade gracefully — the
 * Composer still works without predicted scores, it just doesn't show them.
 * Distinct from a real API failure so the UI can tell "not set up" from "broke".
 */
export class AiUnavailableError extends Error {
  constructor() {
    super("AI features are not configured (set GROQ_API_KEY and/or OPENROUTER_API_KEY).");
    this.name = "AiUnavailableError";
  }
}

/**
 * Run `fn` against each configured provider in order, returning the first
 * success. Groq's free tier has a low daily token cap, so a rate-limit or error
 * there transparently falls through to OpenRouter. Throws AiUnavailableError
 * when nothing is configured, or the last provider's error when all fail.
 */
async function withFallback<T>(fn: (p: Provider) => Promise<T>): Promise<T> {
  const provs = providers();
  if (provs.length === 0) throw new AiUnavailableError();

  let lastErr: unknown;
  for (const p of provs) {
    try {
      return await fn(p);
    } catch (err) {
      lastErr = err;
      // Try the next provider. If this was the last one, the error rethrows below.
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All AI providers failed.");
}

/**
 * Run a prompt and validate the JSON response against a zod schema.
 *
 * Forces a function/tool call whose parameters are the caller's shape, which is
 * the reliable way to get structured output back — the model must return an
 * object matching the schema rather than prose we'd have to parse out of a code
 * fence. The zod parse is the backstop: a malformed tool call throws (inside the
 * fallback loop, so the next provider gets a shot) rather than flowing on as a
 * half-valid object.
 */
export async function generateStructured<T>(params: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const { system, prompt, schema, jsonSchema, maxTokens = 1500 } = params;

  return withFallback(async (p) => {
    const response = await p.client.chat.completions.create({
      model: p.model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "respond",
            description: "Return the structured response.",
            parameters: jsonSchema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "respond" } },
    });

    const call = response.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== "function") {
      throw new Error("Model did not return a structured tool call.");
    }
    return schema.parse(JSON.parse(call.function.arguments));
  });
}

/**
 * Stream a chat completion as plain text deltas.
 *
 * Provider fallback happens at stream *creation* — if Groq rejects the request
 * (auth, rate limit, bad model) we fall through to OpenRouter before the first
 * token. A mid-stream failure can't be retried, so it surfaces as an inline
 * error message rather than a thrown exception (the caller pipes this straight
 * to the client).
 */
export async function createChatStream(params: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<ReadableStream<string>> {
  const { system, user, maxTokens = 1024 } = params;

  const completion = await withFallback((p) =>
    p.client.chat.completions.create({
      model: p.model,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  );

  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(delta);
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

/**
 * Vision variant of `generateStructured` for a single image.
 *
 * Uses JSON-object response mode rather than a forced tool call: some free
 * vision models don't support combining image input with tool-calling, and JSON
 * mode is the portable option across Groq and OpenRouter. The caller still
 * validates with zod, and (for the watermark guard) treats any throw as "clean".
 */
export async function generateVisionStructured<T>(params: {
  system: string;
  prompt: string;
  imageUrl: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const { system, prompt, imageUrl, schema, jsonSchema, maxTokens = 400 } = params;

  return withFallback(async (p) => {
    const response = await p.client.chat.completions.create({
      model: p.visionModel,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${system}\n\nRespond ONLY with a JSON object matching this schema: ${JSON.stringify(
            jsonSchema,
          )}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Vision model returned no content.");
    return schema.parse(JSON.parse(content));
  });
}
