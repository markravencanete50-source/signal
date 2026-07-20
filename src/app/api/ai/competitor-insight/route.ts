import { NextResponse } from "next/server";
import { z } from "zod";

import { requireBrandAccess } from "@/lib/auth/dal";
import { AiUnavailableError, isAiConfigured } from "@/lib/llm";
import { generateCompetitorInsight } from "@/lib/ai/competitor-insight";
import { buildCompetitorRows } from "@/lib/competitors/rows";
import { WRITER_ROLES } from "@/types";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/ai/competitor-insight — the grounded comparison line under the
 * competitors table. Client-loaded so the table renders instantly and the AI
 * call only fires when the view is actually open.
 */

const bodySchema = z.object({ brandId: z.string().min(1) });

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "ai");
  if (limited) return limited;

  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await requireBrandAccess(parsed.data.brandId, WRITER_ROLES);
    const rows = await buildCompetitorRows(parsed.data.brandId);
    const insight = await generateCompetitorInsight(rows);
    if (!insight) {
      return NextResponse.json({ error: "Not enough data for an insight yet." }, { status: 422 });
    }
    return NextResponse.json({ insight });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not generate an insight.";
    const status = message.includes("permission") || message.includes("access") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
