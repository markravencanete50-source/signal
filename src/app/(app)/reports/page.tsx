import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { listReports } from "@/lib/db/reports";
import { env } from "@/lib/env";
import { PERIOD_LABELS } from "@/lib/reports/snapshot";
import { getAppContext } from "@/lib/workspace-context";
import type { Report } from "@/types";

import { ReportBuilder } from "./report-builder";
import { ReportCardActions } from "./report-card-actions";

export const metadata = { title: "Reports — Signal" };

/**
 * Reports — white-label, auto-refreshing public links. Team members build a
 * report from a period + brands; Signal snapshots the stored metrics and has
 * Claude narrate them. Each report gets a public `/r/{token}` link to share.
 */
export default async function ReportsPage() {
  const { workspace, brands } = await getAppContext();
  const reports = await listReports(workspace.id);

  return (
    <>
      <div className="mb-[22px]">
        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Reports</h1>
        <p className="text-text-2 mt-[3px] text-[0.88rem]">
          White-label · auto-refreshing public links
        </p>
      </div>

      {brands.length === 0 ? (
        <Card className="text-center">
          <p className="text-[0.95rem] font-semibold">No brands yet</p>
          <p className="text-text-2 mx-auto mt-1 max-w-[380px] text-[0.85rem]">
            Add a brand and connect its accounts first — reports are built from a brand&rsquo;s
            synced metrics.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3.5">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
          <ReportBuilder brands={brands} />
        </div>
      )}
    </>
  );
}

function ReportCard({ report }: { report: Report }) {
  const publicUrl = `${env().APP_URL}/r/${report.publicToken}`;
  const narrative = report.narrative?.summary;

  return (
    <Card>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-[0.95rem] font-semibold">{report.title}</h3>
        <Chip variant="pub">Live link</Chip>
      </div>

      <p className="text-text-2 mb-3 text-[0.76rem]">
        {PERIOD_LABELS[report.period]} · refreshed {timeAgo(report.refreshedAt)} ·{" "}
        {report.viewCount === 0 ? "not viewed yet" : `viewed ${report.viewCount}×`}
        {report.digest?.enabled ? ` · digest → ${report.digest.recipientEmail}` : ""}
      </p>

      {narrative ? (
        <p className="border-accent text-text-2 mb-3.5 border-l-[3px] pl-3 text-[0.85rem] leading-[1.55] italic">
          “{narrative}”
        </p>
      ) : (
        <p className="text-text-2 mb-3.5 text-[0.85rem] leading-relaxed">
          No narrative yet — refresh once this brand has synced metrics.
        </p>
      )}

      <ReportCardActions reportId={report.id} publicUrl={publicUrl} digest={report.digest} />
    </Card>
  );
}

/** Compact "2 h ago" relative label, computed at request time (server render). */
function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
