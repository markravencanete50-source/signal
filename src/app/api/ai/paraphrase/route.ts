import { NextResponse } from "next/server";
import { z } from "zod";

import { paraphraseContent } from "@/lib/ai/content-suggest";
import { requireBrandAccess } from "@/lib/auth/dal";
import { AiUnavailableError, isAiConfigured } from "@/lib/llm";
import { getBrand } from "@/lib/db/brands";
import { WRITER_ROLES } from "@/types";

/**
 * POST /api/ai/paraphrase — rewrite a line into at least 3 variants.
 *
 * Backs the "Paraphrase" tool in the Planner AI suggestion tab. Writers only,
 * Zod-validated body, and it degrades the same way the rest of the AI surface
 * does (503 when unconfigured).
 */

const bodySchema = z.object({
  brandId: z.string().min(1),
  text: z.string().min(1).max(2000),
  platform: z.enum(["fb", "ig"]),
});

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
    const brand = await getBrand(parsed.data.brandId);

    const result = await paraphraseContent({
      text: parsed.data.text,
      platform: parsed.data.platform,
      brandVoice: brand
        ? describeBrandVoice(
            brand.name,
            brand.pillars.map((p) => p.name),
          )
        : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not paraphrase that.";
    const status = message.includes("permission") || message.includes("access") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** A compact voice hint from what we know about the brand. */
function describeBrandVoice(name: string, pillars: string[]): string {
  return `${name}. Content pillars: ${pillars.join(", ")}.`;
}
