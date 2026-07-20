import { NextResponse } from "next/server";

import { searchWorkspace } from "@/lib/search";
import { getAppContext } from "@/lib/workspace-context";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/search?q= — global search across the caller's workspace.
 *
 * Scoped by `getAppContext()` (session → workspace), so results are always the
 * caller's own tenant. Short queries return nothing (a single letter would match
 * half the workspace). The gather+rank happens server-side over a bounded set;
 * there's no external search service.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "search");
  if (limited) return limited;

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ brands: [], posts: [], media: [], reports: [], total: 0 });
  }

  try {
    const { workspace } = await getAppContext();
    const results = await searchWorkspace(workspace.id, query);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}
