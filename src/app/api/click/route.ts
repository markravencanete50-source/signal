import { NextResponse } from "next/server";
import { z } from "zod";

import { recordClick } from "@/lib/db/smartlinks";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/click?s={smartlinkId}&l={linkId}&ref={postId} — SmartLink click
 * redirect. Public (no auth): the SmartLink page is public.
 *
 * Records the click, attributes it to the post named by `ref` (validated
 * server-side against the SmartLink's workspace in `recordClick`), then 302s to
 * the link's STORED destination. The redirect target comes from the SmartLink
 * document, never from a query param, so this can't be turned into an open
 * redirect.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  s: z.string().min(1),
  l: z.string().min(1),
  ref: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "click");
  if (limited) return limited;

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    s: url.searchParams.get("s"),
    l: url.searchParams.get("l"),
    ref: url.searchParams.get("ref") ?? undefined,
  });

  // A malformed link falls back to the home page rather than erroring at a user.
  if (!parsed.success) {
    return NextResponse.redirect(env().APP_URL);
  }

  const target = await recordClick(parsed.data.s, parsed.data.l, parsed.data.ref ?? null).catch(
    () => null,
  );

  return NextResponse.redirect(target ?? env().APP_URL);
}
