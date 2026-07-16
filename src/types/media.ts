/**
 * Media asset domain type.
 *
 * Split out from the main types barrel because it carries Cloudinary-specific
 * fields the rest of the domain doesn't need to know about.
 */
export interface MediaAsset {
  id: string;
  workspaceId: string;
  cloudinaryPublicId: string;
  type: "image" | "video";
  format: string;
  width: number;
  height: number;
  bytes: number;
  durationSec?: number;
  tags: string[];
  folder: string;
  uploadedBy: string;
  createdAt: string;
  /** Where this asset has been used, so the library can show usage badges. */
  usage: Array<{ postId: string; platform: "fb" | "ig"; usedAt: string }>;
  /** Native-format guard results, set on upload. */
  guard?: {
    watermarkDetected: boolean;
    reformatted: boolean;
    /** Cloudinary URL of the cleaned re-export, if one was produced. */
    reformattedUrl?: string;
  };
  /** Convenience: the secure delivery URL of the original. */
  secureUrl: string;
}
