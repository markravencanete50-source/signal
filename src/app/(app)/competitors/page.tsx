import { Card } from "@/components/ui/card";
import { requireTeamView } from "@/lib/auth/view-guard";
import { listCompetitors } from "@/lib/db/competitors";
import { buildCompetitorRows } from "@/lib/competitors/rows";
import { getAppContext } from "@/lib/workspace-context";

import { AddCompetitor, CompetitorInsight, RemoveCompetitor } from "./competitors-client";

export const metadata = { title: "Competitors — Signal" };

/**
 * Competitors — daily public-data snapshots of tracked profiles, benchmarked
 * against your own account. Team-only. The table renders from stored snapshots;
 * the AI comparison insight loads separately so it never blocks the numbers.
 */
export default async function CompetitorsPage() {
  await requireTeamView();
  const { activeBrand } = await getAppContext();

  return (
    <>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Competitors</h1>
          <p className="text-text-2 mt-[3px] text-[0.88rem]">Daily snapshots · public data only</p>
        </div>
        {activeBrand && <AddCompetitor brandId={activeBrand.id} />}
      </div>

      {!activeBrand ? (
        <Card className="text-center">
          <p className="text-[0.95rem] font-semibold">No brand selected</p>
          <p className="text-text-2 mx-auto mt-1 max-w-[380px] text-[0.85rem]">
            Add a brand and connect its Instagram to benchmark against competitors.
          </p>
        </Card>
      ) : (
        <Table brandId={activeBrand.id} />
      )}
    </>
  );
}

async function Table({ brandId }: { brandId: string }) {
  const [competitors, rows] = await Promise.all([
    listCompetitors(brandId),
    buildCompetitorRows(brandId),
  ]);

  if (competitors.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-[0.95rem] font-semibold">No competitors tracked yet</p>
        <p className="text-text-2 mx-auto mt-1 max-w-[420px] text-[0.85rem]">
          Track a rival&rsquo;s Instagram handle and Signal takes a daily public-data snapshot —
          followers, posting cadence and engagement — to benchmark against yours.
        </p>
      </Card>
    );
  }

  const awaitingSnapshot = competitors.filter((c) => !c.latest);

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[0.86rem]">
          <thead className="border-border text-text-2 border-b text-[0.76rem]">
            <tr>
              <th className="py-2.5 pr-3 font-semibold">Account</th>
              <th className="px-3 py-2.5 text-right font-semibold">Followers</th>
              <th className="px-3 py-2.5 text-right font-semibold">30d growth</th>
              <th className="px-3 py-2.5 text-right font-semibold">Posts / wk</th>
              <th className="px-3 py-2.5 text-right font-semibold">Avg engagement</th>
              <th className="py-2.5 pl-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.competitorId ?? "you"} className="border-border border-b last:border-0">
                <td className="py-2.5 pr-3 font-medium">
                  {r.name}
                  {r.isYou && <span className="text-text-2 font-normal"> (you)</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.followers.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.growth30dPct === null ? (
                    <span className="text-text-2">—</span>
                  ) : (
                    <span className={r.growth30dPct >= 0 ? "text-success" : "text-danger"}>
                      {r.growth30dPct >= 0 ? "▲" : "▼"} {Math.abs(r.growth30dPct)}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.postsPerWeek.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.avgEngagementRatePct.toFixed(1)}%
                </td>
                <td className="py-2.5 pl-3 text-right">
                  {r.competitorId && <RemoveCompetitor competitorId={r.competitorId} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {awaitingSnapshot.length > 0 && (
        <p className="text-text-2 mt-3 text-[0.78rem]">
          {awaitingSnapshot.map((c) => c.handle).join(", ")} — first snapshot lands after
          tonight&rsquo;s sync.
        </p>
      )}

      <CompetitorInsight brandId={brandId} />
    </Card>
  );
}
