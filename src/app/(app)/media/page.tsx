import { listAssets } from "@/lib/db/media";
import { requireTeamView } from "@/lib/auth/view-guard";
import { getAppContext } from "@/lib/workspace-context";

import { MediaLibrary } from "./media-library";

export const metadata = { title: "Media library — Signal" };

/**
 * Media library. Replicates the preview's `.media-grid` — signed Cloudinary
 * uploads, tag filters, usage badges and the native-format guard.
 */
export default async function MediaPage() {
  await requireTeamView();
  const { workspace } = await getAppContext();
  const assets = await listAssets(workspace.id);

  // Serialise to plain objects for the client component (Firestore Timestamps
  // and class instances don't cross the server/client boundary).
  const plain = assets.map((a) => ({
    id: a.id,
    type: a.type,
    secureUrl: a.secureUrl,
    tags: a.tags,
    durationSec: a.durationSec,
    usageCount: a.usage.length,
    lastUsedAt: a.usage.at(-1)?.usedAt,
    watermarkStripped: Boolean(a.guard?.reformatted),
    createdAt: a.createdAt,
  }));

  const totalBytes = assets.reduce((sum, a) => sum + a.bytes, 0);

  return <MediaLibrary assets={plain} totalBytes={totalBytes} />;
}
