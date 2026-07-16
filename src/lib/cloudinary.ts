import "server-only";

import { v2 as cloudinary } from "cloudinary";

import { env } from "./env";

/**
 * Cloudinary — signed uploads and per-platform transformations.
 *
 * Uploads are ALWAYS signed server-side: the browser asks this module for a
 * signature, uploads directly to Cloudinary with it, and the API secret never
 * leaves the server. An unsigned upload preset would let anyone upload to the
 * account.
 *
 * Folders are prefixed by workspaceId so one tenant's media can't collide with
 * or be enumerated from another's.
 */

let configured = false;

function configure() {
  if (configured) return;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env();
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

/**
 * Produce a signature the browser uses to upload one asset directly to
 * Cloudinary. The signed params (timestamp + folder) are exactly what the
 * browser must echo back — Cloudinary rejects the upload if they don't match,
 * so the client can't redirect the upload into another workspace's folder.
 */
export function signUpload(workspaceId: string): UploadSignature {
  configure();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `signal/${workspaceId}`;

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    env().CLOUDINARY_API_SECRET,
  );

  return {
    signature,
    timestamp,
    apiKey: env().CLOUDINARY_API_KEY,
    cloudName: env().CLOUDINARY_CLOUD_NAME,
    folder,
  };
}

/**
 * Named per-platform transformations, applied by rewriting the delivery URL.
 *
 * IG feed 1080×1350 (4:5), IG reel 1080×1920 (9:16), FB feed 1200×630, plus
 * `q_auto,f_auto` everywhere for automatic quality/format. Meta fetches these
 * URLs itself when publishing (the IG container step), so the transformed URL
 * must be publicly deliverable — which Cloudinary's are.
 */
const TRANSFORMS = {
  ig_feed: "c_fill,g_auto,w_1080,h_1350,q_auto,f_auto",
  ig_reel: "c_fill,g_auto,w_1080,h_1920,q_auto,f_auto",
  fb_feed: "c_fill,g_auto,w_1200,h_630,q_auto,f_auto",
  thumb: "c_fill,g_auto,w_400,h_400,q_auto,f_auto",
} as const;

export type TransformName = keyof typeof TRANSFORMS;

/**
 * Build a delivery URL for a stored asset with a named transformation.
 *
 * String-built rather than via the SDK's URL builder so it works without a
 * configure() call and stays trivially cacheable. `resourceType` matters:
 * videos live under /video/, images under /image/.
 */
export function transformedUrl(
  publicId: string,
  transform: TransformName,
  resourceType: "image" | "video" = "image",
): string {
  const cloud = env().CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloud}/${resourceType}/upload/${TRANSFORMS[transform]}/${publicId}`;
}

/** Extract a single video frame as an image, for watermark detection (Phase 2 guard). */
export function videoFrameUrl(publicId: string, second = 1): string {
  const cloud = env().CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloud}/video/upload/so_${second},w_640,q_auto,f_jpg/${publicId}.jpg`;
}

/**
 * Re-export a video cropped to remove a watermark strip.
 *
 * The native-format guard uses this: TikTok/CapCut watermarks sit in known
 * regions, so a crop that trims the offending band produces a clean re-export.
 * Returns a new delivery URL; the original public_id is untouched.
 */
export function reExportCropped(publicId: string, cropPct = 8): string {
  const cloud = env().CLOUDINARY_CLOUD_NAME;
  // Crop `cropPct`% off the bottom where CapCut/TikTok marks usually sit, then
  // scale back to a standard reel height.
  const keep = 100 - cropPct;
  return `https://res.cloudinary.com/${cloud}/video/upload/c_crop,g_north,h_${keep}p,w_100p/c_fill,w_1080,h_1920,q_auto/${publicId}`;
}

export async function deleteAsset(
  publicId: string,
  resourceType: "image" | "video",
): Promise<void> {
  configure();
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
