import { NextResponse } from "next/server";

import { requireWriter } from "@/lib/auth/dal";
import { deleteAsset } from "@/lib/cloudinary";
import { deleteAssetDoc, getAsset } from "@/lib/db/media";
import { getAppContext } from "@/lib/workspace-context";

/**
 * DELETE /api/media/[id] — remove an asset from Cloudinary and Firestore.
 *
 * Irreversible, so gated to writer roles (owner/admin/editor — excludes
 * client) rather than the plainer requireMember. Ownership is checked against
 * the caller's own workspace before anything is deleted, since asset ids are
 * guessable sequential-looking strings, not capability tokens.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { workspace } = await getAppContext();
    await requireWriter(workspace.id);

    const asset = await getAsset(id);
    if (!asset || asset.workspaceId !== workspace.id) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }

    // Best-effort on Cloudinary: a delete that's already gone there (e.g. a
    // retried request) must not block removing the now-orphaned Firestore doc.
    await deleteAsset(asset.cloudinaryPublicId, asset.type).catch(() => {});
    await deleteAssetDoc(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete the asset.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
