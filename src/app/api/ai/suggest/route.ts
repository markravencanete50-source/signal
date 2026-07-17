import { NextResponse } from "next/server";
import { z } from "zod";

import { generateSuggestions } from "@/lib/ai/suggest";
import { requireBrandAccess } from "@/lib/auth/dal";
import { AiUnavailableError, isAiConfigured } from "@/lib/llm";
import { WRITER_ROLES } from "@/types";

/**
 * POST /api/ai/suggest — 3 scored, grounded next-post suggestions for Studio.
 *
 * Writers only (clients don't burn AI quota). Returns null-equivalent 200 with
 * `{ suggestions: [] }` shape via the function, or a 204-style empty when there's
 * no data to ground on.
 */

const bodySchema = z.object({ brandId: z.string().min(1) });

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await requireBrandAccess(parsed.data.brandId, WRITER_ROLES);
    const result = await generateSuggestions(parsed.data.brandId);

    if (!result) {
      return NextResponse.json({ suggestions: [], reason: "no_data" }, { status: 200 });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not generate suggestions.";
    const status = message.includes("permission") || message.includes("access") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
