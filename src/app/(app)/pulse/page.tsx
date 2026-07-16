import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { requireTeamView } from "@/lib/auth/view-guard";
import { listAnomalies } from "@/lib/db/anomalies";
import { listConnectionsForBrand } from "@/lib/db/connections";
import { listAssets } from "@/lib/db/media";
import { listPlatformChanges } from "@/lib/db/platform-changes";
import { getAppContext } from "@/lib/workspace-context";
import { PLATFORM_LABEL, type Platform } from "@/types";
import type { Anomaly } from "@/types/metrics";

import { PlatformChangesEditor } from "./platform-changes-editor";

export const metadata = { title: "Pulse — Signal" };

/**
 * Pulse — "is it you, or is it the algorithm?". Per-platform status cards, the
 * anomaly log with verdicts + reasoning, native-format-guard stats, and the
 * admin-curated platform-changes feed.
 */
export default async function PulsePage() {
  await requireTeamView();
  const { workspace, activeBrand, role } = await getAppContext();
  const isAdmin = role === "owner" || role === "admin";

  const [anomalies, connections, assets, changes] = await Promise.all([
    listAnomalies(workspace.id, 20),
    activeBrand ? listConnectionsForBrand(activeBrand.id) : Promise.resolve([]),
    listAssets(workspace.id),
    listPlatformChanges(workspace.id),
  ]);

  const guardStats = computeGuardStats(assets);
  const platformStatus = derivePlatformStatus(anomalies);

  return (
    <>
      <div className="mb-[22px]">
        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Pulse</h1>
        <p className="text-text-2 mt-[3px] text-[0.88rem]">
          Platform watch — is it you, or is it the algorithm?
        </p>
      </div>

      <div className="mb-3.5 grid gap-3.5 md:grid-cols-2">
        {(["fb", "ig"] as Platform[]).map((p) => {
          const status = platformStatus[p];
          const connected = connections.some((c) => c.platform === p);
          return (
            <Card key={p} className="flex items-center gap-3.5">
              <PlatformIcon platform={p} size={38} />
              <div className="flex-1">
                <p className="text-[0.92rem] font-semibold">{PLATFORM_LABEL[p]}</p>
                <p className="text-text-2 text-[0.78rem]">
                  {!connected
                    ? "Not connected"
                    : status.anomaly
                      ? `Reach shift detected ${new Date(status.detectedAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : "Reach in normal range"}
                </p>
              </div>
              {connected && (
                <Chip variant={status.anomaly ? "pend" : "pub"}>
                  {status.anomaly ? "Shift detected" : "Normal"}
                </Chip>
              )}
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardTitle>Anomaly log</CardTitle>
          {anomalies.length === 0 ? (
            <p className="text-text-2 text-[0.85rem] leading-relaxed">
              No anomalies detected. Signal watches your reach every hour and flags a drop of more
              than 40% — telling you whether it&rsquo;s account-wide (a platform shift) or specific
              to one brand (a content problem).
            </p>
          ) : (
            <div className="relative pl-[22px]">
              <div className="bg-border absolute top-1.5 bottom-1.5 left-1.5 w-0.5" />
              {anomalies.map((a) => (
                <div key={a.id} className="relative pb-[18px] last:pb-0">
                  <span
                    className={`bg-surface absolute top-1 -left-[20px] size-2.5 rounded-full border-[2.5px] ${
                      a.verdict === "platform_side" ? "border-warning" : "border-accent"
                    }`}
                  />
                  <time className="text-text-2 text-[0.7rem] font-semibold tracking-[0.05em] uppercase">
                    {new Date(a.detectedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                  <p className="mt-1 text-[0.85rem] leading-relaxed">{a.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-3.5">
          <Card>
            <CardTitle>Native-format guard</CardTitle>
            <p className="text-text-2 mb-1 text-[0.8rem] leading-relaxed">
              Recycled and watermarked content is down-ranked. Signal checks every upload before it
              publishes.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-3.5">
              <GuardStat value={guardStats.reformatted} label="Auto-reformatted" />
              <GuardStat value={guardStats.watermarked} label="Watermark stripped" />
              <GuardStat value={guardStats.total} label="Assets checked" />
            </div>
          </Card>

          <Card>
            <CardTitle>Platform changes feed</CardTitle>
            <PlatformChangesEditor workspaceId={workspace.id} changes={changes} canEdit={isAdmin} />
          </Card>
        </div>
      </div>
    </>
  );
}

function GuardStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-surface-2 min-w-[110px] flex-1 rounded-xl p-3.5">
      <span className="font-display block text-[1.3rem] font-bold">{value}</span>
      <span className="text-text-2 text-[0.72rem] font-medium">{label}</span>
    </div>
  );
}

function computeGuardStats(
  assets: Array<{ guard?: { watermarkDetected: boolean; reformatted: boolean } }>,
) {
  return {
    total: assets.length,
    reformatted: assets.filter((a) => a.guard?.reformatted).length,
    watermarked: assets.filter((a) => a.guard?.watermarkDetected).length,
  };
}

/** Latest verdict per platform, for the status cards. */
function derivePlatformStatus(anomalies: Anomaly[]) {
  const status: Record<Platform, { anomaly: boolean; detectedAt?: string }> = {
    fb: { anomaly: false },
    ig: { anomaly: false },
  };
  const recentCutoff = Date.now() - 8 * 86_400_000;
  for (const a of anomalies) {
    if (a.resolvedAt) continue;
    if (new Date(a.detectedAt).getTime() < recentCutoff) continue;
    const p = a.platform;
    if (!status[p].anomaly) status[p] = { anomaly: true, detectedAt: a.detectedAt };
  }
  return status;
}
