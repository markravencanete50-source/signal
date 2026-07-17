import { NextResponse } from "next/server";
import { z } from "zod";

import { scoreDraft } from "@/lib/ai/score";
import { requireBrandAccess } from "@/lib/auth/dal";
import { AiUnavailableError, isAiConfigured } from "@/lib/llm";
import { getBrand } from "@/lib/db/brands";
import { WRITER_ROLES } from "@/types";

/**
 * POST /api/ai/score — predicted intent score for a draft (Composer ring).
 *
 * Returns { score, reasoning, improvement } — never a bare number, per spec.
 */

const bodySchema = z.object({
  brandId: z.string().min(1),
  caption: z.string().max(3000),
  platform: z.enum(["fb", "ig"]),
  hasMedia: z.boolean(),
  format: z.enum(["image", "video", "carousel"]).optional(),
});

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

    const result = await scoreDraft({
      caption: parsed.data.caption,
      platform: parsed.data.platform,
      hasMedia: parsed.data.hasMedia,
      format: parsed.data.format,
      brandVoice: brand?.name,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not score the draft.";
    const status = message.includes("permission") || message.includes("access") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
