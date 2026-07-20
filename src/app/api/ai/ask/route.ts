import { z } from "zod";

import { AskUnavailable, askSignalStream } from "@/lib/ai/ask";
import { requireBrandAccess } from "@/lib/auth/dal";
import { isAiConfigured } from "@/lib/llm";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/ai/ask — streaming grounded answer for the Ask Signal chat.
 *
 * Returns a text/plain stream of tokens (not JSON) so the client can render the
 * answer as it arrives, matching the preview's typing effect. Any member can
 * ask — reading your own brand's data is fine for all roles.
 */

const bodySchema = z.object({
  brandId: z.string().min(1),
  question: z.string().min(1).max(1000),
});

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "ai");
  if (limited) return limited;

  if (!isAiConfigured()) {
    return textResponse(
      "Ask Signal isn't set up yet — add an Anthropic API key to enable it.",
      503,
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return textResponse("Please ask a question.", 400);
  }

  try {
    await requireBrandAccess(parsed.data.brandId, ["owner", "admin", "editor", "client"]);
    const stream = await askSignalStream(parsed.data.brandId, parsed.data.question);

    // Convert the string stream to bytes for the HTTP response.
    const encoder = new TextEncoder();
    const byteStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = stream.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(value));
        }
        controller.close();
      },
    });

    return new Response(byteStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof AskUnavailable) return textResponse(err.message, 503);
    const message = err instanceof Error ? err.message : "Something went wrong.";
    const status = message.includes("permission") || message.includes("access") ? 403 : 500;
    return textResponse(message, status);
  }
}

function textResponse(text: string, status: number): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
