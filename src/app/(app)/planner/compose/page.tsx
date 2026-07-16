import { listAssets } from "@/lib/db/media";
import { listConnectionsForBrand } from "@/lib/db/connections";
import { requireTeamView } from "@/lib/auth/view-guard";
import { getAppContext } from "@/lib/workspace-context";

import { Composer } from "./composer";

export const metadata = { title: "New post — Signal" };

/**
 * Composer route `/planner/compose`. Server-loads the brand's media, connected
 * platforms and best-time slots, then hands off to the client modal.
 *
 * Rendered as a full route (not an overlay portal) so it deep-links and the
 * back button behaves. On desktop the client component styles itself as the
 * preview's centred modal over a dimmed backdrop.
 */
export default async function ComposePage() {
  await requireTeamView();
  const { activeBrand, workspace } = await getAppContext();

  if (!activeBrand) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-5 text-center">
        <div>
          <h1 className="text-[1.3rem] font-bold">No brand selected</h1>
          <p className="text-text-2 mt-2 text-[0.88rem]">Create a brand before composing a post.</p>
          <a
            href="/settings/brands"
            className="bg-accent text-accent-fg mt-4 inline-flex rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold"
          >
            Add a brand
          </a>
        </div>
      </div>
    );
  }

  const [assets, connections] = await Promise.all([
    listAssets(workspace.id),
    listConnectionsForBrand(activeBrand.id),
  ]);

  const connectedPlatforms = connections.map((c) => c.platform);

  const mediaOptions = assets.map((a) => ({
    id: a.id,
    type: a.type,
    thumbUrl:
      a.type === "video" ? a.secureUrl.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg") : a.secureUrl,
  }));

  return (
    <Composer
      brandId={activeBrand.id}
      brandName={activeBrand.name}
      connectedPlatforms={connectedPlatforms}
      media={mediaOptions}
      pillars={activeBrand.pillars.map((p) => p.name)}
    />
  );
}
