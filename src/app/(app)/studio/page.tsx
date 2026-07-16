import { Card } from "@/components/ui/card";
import { IntentRing } from "@/components/ui/intent-ring";
import { getCoherence } from "@/lib/ai/coherence";
import { requireTeamView } from "@/lib/auth/view-guard";
import { listPostsByStatus } from "@/lib/db/posts";
import { getAppContext } from "@/lib/workspace-context";
import { computePillarBalance } from "@/services/pillars";
import type { Post } from "@/types";

import { GenerateWeekButton, Suggestions } from "./studio-client";

export const metadata = { title: "Studio — Signal" };

/**
 * Studio — content that starts from your data. Coherence ring + pillar balance
 * are server-rendered (coherence is cached per day, so it's cheap). Suggestions
 * load client-side so opening Studio doesn't fire a Claude call every time — and
 * so the page paints immediately while ideas stream in.
 */
export default async function StudioPage() {
  await requireTeamView();
  const { workspace, activeBrand } = await getAppContext();

  if (!activeBrand) {
    return (
      <>
        <Head />
        <Card>
          <p className="text-text-2 text-[0.88rem]">Select a brand to open Studio.</p>
        </Card>
      </>
    );
  }

  // Pillar balance from the brand's posts across all statuses.
  const [coherence, published, scheduled, drafts] = await Promise.all([
    getCoherence(activeBrand.id, workspace.id),
    listPostsByStatus(workspace.id, "published"),
    listPostsByStatus(workspace.id, "scheduled"),
    listPostsByStatus(workspace.id, "draft"),
  ]);

  const brandPosts = [...published, ...scheduled, ...drafts].filter(
    (p: Post) => p.brandId === activeBrand.id,
  );
  const balance = computePillarBalance(activeBrand.pillars, brandPosts);

  return (
    <>
      <Head brandId={activeBrand.id} />

      <Card className="mb-3.5">
        <div className="flex flex-wrap items-center gap-[18px]">
          {coherence ? (
            <IntentRing score={coherence.score} size={96} />
          ) : (
            <div className="border-surface-2 text-text-2 grid size-24 shrink-0 place-items-center rounded-full border-[6px] text-[0.7rem]">
              n/a
            </div>
          )}
          <div className="text-text-2 flex-1 text-[0.82rem] leading-relaxed">
            {coherence ? (
              <>
                <b className="text-text-1">
                  Niche coherence:{" "}
                  {coherence.score >= 80
                    ? "strong"
                    : coherence.score >= 60
                      ? "moderate"
                      : "scattered"}
                  .
                </b>{" "}
                {coherence.reasoning}
                {coherence.driftNote && <> {coherence.driftNote}</>}
              </>
            ) : (
              <>
                <b className="text-text-1">Niche coherence</b> appears once you&rsquo;ve published a
                few posts and AI is configured — Meta reads your recent posts to tag your topic, so
                a consistent feed earns more recommendation reach.
              </>
            )}
          </div>
        </div>

        {/* Pillar balance bar — actual vs target */}
        <div className="my-2.5 flex h-4 overflow-hidden rounded-[9px]">
          {balance.map((b) => (
            <i key={b.name} style={{ width: `${b.actualPct}%`, background: b.color }} />
          ))}
          {balance.every((b) => b.actualPct === 0) && <i className="bg-surface-2 w-full" />}
        </div>
        <div className="text-text-2 flex flex-wrap gap-4 text-[0.76rem]">
          {balance.map((b) => (
            <span key={b.name} className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: b.color }} />
              <b className="text-text-1">{b.actualPct}%</b> {b.name}
              <span className="text-text-2">/ {b.targetPct}% target</span>
            </span>
          ))}
        </div>
      </Card>

      <h3 className="mb-0.5 text-[0.95rem] font-semibold">Suggested next posts</h3>
      <p className="text-text-2 mb-1 text-[0.8rem]">
        Every suggestion is grounded in your posts&rsquo; real performance — with the reasoning
        shown.
      </p>

      <Suggestions brandId={activeBrand.id} />
    </>
  );
}

function Head({ brandId }: { brandId?: string }) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-[1.5rem] font-bold tracking-[-0.02em]">
          Studio
        </h1>
        <p className="text-text-2 mt-[3px] text-[0.88rem]">
          Content that starts from your data — not a blank page
        </p>
      </div>
      {brandId && <GenerateWeekButton brandId={brandId} />}
    </div>
  );
}
