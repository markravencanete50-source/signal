import { NextResponse } from "next/server";
import { z } from "zod";

import { requireBrandAccess } from "@/lib/auth/dal";
import { AiUnavailableError, isAiConfigured } from "@/lib/llm";
import { getBrand } from "@/lib/db/brands";
import { getInboxItem } from "@/lib/db/inbox";
import { getRecentCaptions } from "@/lib/db/posts";
import { suggestReply } from "@/lib/ai/reply";
import { WRITER_ROLES } from "@/types";

/**
 * POST /api/ai/reply — a drafted reply to an inbox item.
 *
 * Looks the item up server-side by id (so the draft is grounded in the real
 * message, not client-supplied text) and authorises the caller against the
 * item's brand. Writers only — a client can't burn AI quota or reply as the brand.
 */

const bodySchema = z.object({ itemId: z.string().min(1) });

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const item = await getInboxItem(parsed.data.itemId);
    if (!item) return NextResponse.json({ error: "Message not found." }, { status: 404 });

    await requireBrandAccess(item.brandId, WRITER_ROLES);

    const [brand, voiceSamples] = await Promise.all([
      getBrand(item.brandId),
      getRecentCaptions(item.brandId, 5),
    ]);

    const suggestion = await suggestReply({
      brandName: brand?.name ?? "the brand",
      voiceSamples,
      authorName: item.authorName,
      message: item.text,
      sentiment: item.sentiment,
    });

    if (!suggestion) {
      return NextResponse.json({ error: "Could not draft a reply." }, { status: 503 });
    }
    return NextResponse.json(suggestion);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not draft a reply.";
    const status = message.includes("permission") || message.includes("access") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
