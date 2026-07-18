import { requireTeamView } from "@/lib/auth/view-guard";
import { listConnectionsForBrand } from "@/lib/db/connections";
import { listAssets } from "@/lib/db/media";
import { listPostMetrics } from "@/lib/db/metrics";
import { getPost } from "@/lib/db/posts";
import { getAppContext } from "@/lib/workspace-context";
import { bestTimeSlots, type PostTiming } from "@/services/besttime";
import type { Platform } from "@/types";

import { Composer, type EditPost } from "./composer";

export const metadata = { title: "New post — Signal" };

/**
 * Composer route `/planner/compose`. Server-loads the brand's media, connected
 * platforms and best-time slots, then hands off to the client modal.
 *
 * Accepts a `?caption=` prefill (from Studio's "Draft it") and `?edit=<postId>`
 * to open an existing post for editing — the Planner's click-to-edit target.
 * Best-time slots are computed from the brand's own post metrics via the pure
 * engine.
 */
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ caption?: string; edit?: string }>;
}) {
  await requireTeamView();
  const { activeBrand, workspace } = await getAppContext();
  const params = await searchParams;

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

  const [assets, connections, metrics] = await Promise.all([
    listAssets(workspace.id),
    listConnectionsForBrand(activeBrand.id),
    listPostMetrics(activeBrand.id, 200),
  ]);

  const connectedPlatforms = connections.map((c) => c.platform);
  const primary: Platform = connectedPlatforms[0] ?? "ig";
  const bestTimes = bestTimeSlots(toTimings(metrics), primary);

  const mediaOptions = assets.map((a) => ({
    id: a.id,
    type: a.type,
    thumbUrl:
      a.type === "video" ? a.secureUrl.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg") : a.secureUrl,
  }));

  // Click-to-edit: load the post and hand it to the composer prefilled. A post
  // from another brand is ignored rather than errored — the id came from a URL.
  let editPost: EditPost | undefined;
  if (params.edit) {
    const post = await getPost(params.edit);
    if (post && post.brandId === activeBrand.id) {
      editPost = {
        id: post.id,
        status: post.status,
        scheduledAt: post.scheduledAt,
        pillar: post.pillar,
        fbCaption: post.variants.facebook?.caption,
        igCaption: post.variants.instagram?.caption,
        mediaAssetIds: [
          ...new Set([
            ...(post.variants.facebook?.mediaAssetIds ?? []),
            ...(post.variants.instagram?.mediaAssetIds ?? []),
          ]),
        ],
        fbPermalink: post.results?.facebook?.permalink,
        igPermalink: post.results?.instagram?.permalink,
        hasPublishedFb: Boolean(post.results?.facebook?.externalId),
      };
    }
  }

  return (
    <Composer
      brandId={activeBrand.id}
      brandName={activeBrand.name}
      connectedPlatforms={connectedPlatforms}
      media={mediaOptions}
      pillars={activeBrand.pillars.map((p) => p.name)}
      bestTimes={bestTimes}
      initialCaption={params.caption ?? ""}
      editPost={editPost}
    />
  );
}

/** Build best-time timing samples from stored post metrics. */
function toTimings(metrics: { publishedAt: string; intentScore: number }[]): PostTiming[] {
  return metrics.map((m) => {
    const d = new Date(m.publishedAt);
    return { weekday: d.getDay(), hour: d.getHours(), intentScore: m.intentScore };
  });
}
