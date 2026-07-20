import { NextResponse } from "next/server";
import { z } from "zod";

import { generateCaption } from "@/lib/ai/caption";
import { requireBrandAccess } from "@/lib/auth/dal";
import { AiUnavailableError, isAiConfigured } from "@/lib/llm";
import { getBrand } from "@/lib/db/brands";
import { WRITER_ROLES } from "@/types";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/ai/caption — caption + hashtag suggestions for the Composer.
 *
 * Authorises against the brand (writers only — a client can't burn AI quota),
 * then generates. Zod-validates the body per the build rule "zod-validate every
 * API route input".
 */

const bodySchema = z.object({
  brandId: z.string().min(1),
  idea: z.string().min(1).max(2000),
  platform: z.enum(["fb", "ig"]),
});

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "ai");
  if (limited) return limited;

  if (!isAiConfigured()) {
    // 503, not 500: the feature is unconfigured, not broken. The Composer reads
    // this and simply hides the suggestion chips.
    return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await requireBrandAccess(parsed.data.brandId, WRITER_ROLES);
    const brand = await getBrand(parsed.data.brandId);

    const result = await generateCaption({
      idea: parsed.data.idea,
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
    const message = err instanceof Error ? err.message : "Could not generate a caption.";
    const status = message.includes("permission") || message.includes("access") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** A compact voice hint from what we know about the brand. */
function describeBrandVoice(name: string, pillars: string[]): string {
  return `${name}. Content pillars: ${pillars.join(", ")}.`;
}
