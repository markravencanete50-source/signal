import Link from "next/link";

import { Card } from "@/components/ui/card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PlusIcon, SparkIcon } from "@/components/ui/icons";
import { listConnectionsForBrand } from "@/lib/db/connections";
import { getAppContext } from "@/lib/workspace-context";

export const metadata = { title: "Dashboard — Signal" };

/**
 * Dashboard — Phase 1 form.
 *
 * The preview's metric cards, AI insight chain, today's queue and top posts all
 * need synced data (Phase 3) and the AI engine (Phase 4). Rendering the
 * preview's hardcoded numbers now would be a lie, so this ships the real
 * page-head plus an honest onboarding state: connect an account, then create.
 * The metric grid is a labelled skeleton so the layout is proven and the intent
 * is legible.
 */
export default async function DashboardPage() {
  const { user, activeBrand, role } = await getAppContext();

  const greeting = timeGreeting();
  const firstName = user.name?.split(" ")[0] ?? "there";
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const connections = activeBrand ? await listConnectionsForBrand(activeBrand.id) : [];
  const canCompose = role !== "client";

  return (
    <>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">
            {greeting}, {firstName}
          </h1>
          <p className="text-text-2 mt-[3px] text-[0.88rem]">
            {today}
            {activeBrand ? ` · ${activeBrand.name}` : ""}
          </p>
        </div>
        {canCompose && (
          <Link
            href="/planner/compose"
            className="bg-accent text-accent-fg inline-flex items-center gap-2 rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold"
          >
            <PlusIcon className="size-[15px]" />
            New post
          </Link>
        )}
      </div>

      {connections.length === 0 ? (
        <ConnectPrompt canManage={role === "owner" || role === "admin"} />
      ) : (
        <ConnectedSummary connections={connections} />
      )}

      {/* Metric skeleton — real numbers arrive with the sync engine in Phase 3.
          Kept as labelled placeholders so the grid and intent read correctly. */}
      <div className="mt-[22px] mb-[22px] grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {["Followers", "Reach · 7 days", "Intent score · avg", "Niche coherence"].map((label) => (
          <Card key={label} className="p-5">
            <span className="text-text-2 mb-2 block text-[0.76rem] font-medium">{label}</span>
            <span className="font-display text-text-2 text-[1.75rem] leading-none font-bold tracking-[-0.03em]">
              —
            </span>
            <span className="text-text-2 mt-3 block text-[0.72rem]">
              Available after first sync
            </span>
          </Card>
        ))}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.35fr_1fr]">
        <Card className="relative overflow-hidden">
          <span className="text-accent mb-3.5 inline-flex items-center gap-1.5 text-[0.7rem] font-bold tracking-[0.06em] uppercase">
            <SparkIcon />
            AI insight · why, not just what
          </span>
          <p className="text-text-2 text-[0.88rem] leading-relaxed">
            Once your accounts have synced a little history, Signal starts surfacing scored,
            reasoned suggestions here — the signal it read, why it matters, and what to do next.
            Nothing is invented before the data exists.
          </p>
        </Card>

        <Card>
          <h3 className="mb-3 text-[0.95rem] font-semibold">Today&rsquo;s queue</h3>
          <p className="text-text-2 text-[0.86rem] leading-relaxed">
            Nothing scheduled yet.{" "}
            {canCompose ? (
              <Link href="/planner/compose" className="text-accent font-semibold hover:underline">
                Plan your first post
              </Link>
            ) : (
              "Your team hasn't scheduled anything for today."
            )}
          </p>
        </Card>
      </div>
    </>
  );
}

function ConnectPrompt({ canManage }: { canManage: boolean }) {
  return (
    <Card className="border-accent-soft bg-accent-soft/40 flex flex-wrap items-center gap-4">
      <div className="flex-1">
        <h3 className="text-[0.95rem] font-semibold">Connect an account to get started</h3>
        <p className="text-text-2 mt-1 text-[0.85rem]">
          Signal can&rsquo;t publish or measure anything until a Facebook Page or Instagram Business
          account is connected.
        </p>
      </div>
      {canManage && (
        <Link
          href="/settings/connections"
          className="bg-accent text-accent-fg inline-flex items-center rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold"
        >
          Connect account
        </Link>
      )}
    </Card>
  );
}

function ConnectedSummary({
  connections,
}: {
  connections: Array<{ id: string; platform: "fb" | "ig"; accountName: string; status: string }>;
}) {
  return (
    <Card>
      <h3 className="mb-3 text-[0.95rem] font-semibold">Connected accounts</h3>
      <div className="flex flex-wrap gap-3">
        {connections.map((conn) => (
          <div
            key={conn.id}
            className="border-border bg-surface flex items-center gap-2.5 rounded-xl border px-3 py-2"
          >
            <PlatformIcon platform={conn.platform} size={28} />
            <div>
              <p className="text-[0.84rem] font-semibold">{conn.accountName}</p>
              <p className="text-text-2 text-[0.72rem]">
                {conn.status === "active" ? "Connected" : conn.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
