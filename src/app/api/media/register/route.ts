import { NextResponse } from "next/server";
import { z } from "zod";

import { detectWatermark } from "@/lib/ai/watermark";
import { requireMember } from "@/lib/auth/dal";
import { reExportCropped, videoFrameUrl } from "@/lib/cloudinary";
import { createAsset } from "@/lib/db/media";
import { getAppContext } from "@/lib/workspace-context";
import type { MediaAsset } from "@/types/media";

/**
 * POST /api/media/register — persist an asset after a direct Cloudinary upload.
 *
 * The browser uploads to Cloudinary (signed), then posts the upload result here.
 * We create the Firestore doc and, for videos, run the native-format guard:
 * extract a frame, ask Claude if it's watermarked, and if so record a cropped
 * re-export URL so publishing uses the clean version.
 */

const bodySchema = z.object({
  cloudinaryPublicId: z.string().min(1),
  type: z.enum(["image", "video"]),
  format: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  durationSec: z.number().optional(),
  secureUrl: z.string().url(),
  tags: z.array(z.string()).max(20).default([]),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
  }

  try {
    const { workspace, user } = await getAppContext();
    await requireMember(workspace.id);

    const d = parsed.data;

    // Native-format guard — videos only. Best-effort; never blocks the upload.
    let guard: MediaAsset["guard"];
    if (d.type === "video") {
      const detection = await detectWatermark(videoFrameUrl(d.cloudinaryPublicId));
      guard = {
        watermarkDetected: detection.detected,
        reformatted: detection.detected,
        ...(detection.detected ? { reformattedUrl: reExportCropped(d.cloudinaryPublicId) } : {}),
      };
    }

    const assetInput: Omit<MediaAsset, "id"> = {
      workspaceId: workspace.id,
      cloudinaryPublicId: d.cloudinaryPublicId,
      type: d.type,
      format: d.format,
      width: d.width,
      height: d.height,
      bytes: d.bytes,
      durationSec: d.durationSec,
      tags: d.tags,
      folder: `signal/${workspace.id}`,
      uploadedBy: user.uid,
      createdAt: new Date().toISOString(),
      usage: [],
      guard,
      secureUrl: d.secureUrl,
    };

    const id = await createAsset(assetInput);
    return NextResponse.json({ id, guard });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not register the asset.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
