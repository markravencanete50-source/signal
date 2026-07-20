import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/dal";
import { signUpload } from "@/lib/cloudinary";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAppContext } from "@/lib/workspace-context";

/**
 * POST /api/media/sign — issue a Cloudinary upload signature for the browser.
 *
 * The browser uploads directly to Cloudinary with this signature (the API secret
 * never leaves the server). The folder is derived from the caller's OWN
 * workspace here — never taken from the request — so a caller can't sign an
 * upload into someone else's folder.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "media");
  if (limited) return limited;

  try {
    const { workspace } = await getAppContext();
    await requireMember(workspace.id);

    const signature = signUpload(workspace.id);
    return NextResponse.json(signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not sign upload.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
