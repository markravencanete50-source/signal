import { Card } from "@/components/ui/card";
import { InfoIcon } from "@/components/ui/icons";
import { requireTeamView } from "@/lib/auth/view-guard";
import { listAutolists } from "@/lib/db/autolists";
import { getAppContext } from "@/lib/workspace-context";

import { AutolistBuilder } from "./autolist-builder";
import { AutolistCard } from "./autolist-card";

export const metadata = { title: "Autolists — Signal" };

/**
 * Autolists — evergreen queues and RSS feeds that keep publishing on a cadence.
 * Team-only. Unlike blind recyclers, an evergreen autolist auto-retires anything
 * that scored below its threshold last cycle and flags it for a Studio rework.
 */
export default async function AutolistsPage() {
  await requireTeamView();
  const { activeBrand } = await getAppContext();

  return (
    <>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Autolists</h1>
          <p className="text-text-2 mt-[3px] text-[0.88rem]">
            Evergreen queues that keep publishing — with a performance filter
          </p>
        </div>
        {activeBrand && <AutolistBuilder brandId={activeBrand.id} />}
      </div>

      {!activeBrand ? (
        <Card className="text-center">
          <p className="text-[0.95rem] font-semibold">No brand selected</p>
          <p className="text-text-2 mx-auto mt-1 max-w-[380px] text-[0.85rem]">
            Add a brand first — autolists publish to a brand&rsquo;s connected accounts.
          </p>
        </Card>
      ) : (
        <List brandId={activeBrand.id} />
      )}
    </>
  );
}

async function List({ brandId }: { brandId: string }) {
  const autolists = await listAutolists(brandId);

  if (autolists.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-[0.95rem] font-semibold">No autolists yet</p>
        <p className="text-text-2 mx-auto mt-1 max-w-[400px] text-[0.85rem]">
          Create an evergreen queue of your best posts, or connect a blog&rsquo;s RSS feed — Signal
          keeps them publishing and quietly retires anything that stops performing.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2.5">
      {autolists.map((a) => (
        <AutolistCard key={a.id} autolist={a} />
      ))}

      <div className="border-border text-text-2 mt-2 flex items-start gap-2.5 rounded-xl border border-dashed p-3.5 text-[0.82rem] leading-relaxed">
        <InfoIcon className="mt-0.5 size-[15px] flex-none" />
        Unlike standard recycling tools, Signal won&rsquo;t blindly re-post: anything that scored
        below its threshold last cycle is pulled from the queue and flagged for a rework in Studio.
      </div>
    </div>
  );
}
