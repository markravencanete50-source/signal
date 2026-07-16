import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import { IntentRing } from "@/components/ui/intent-ring";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PlusIcon, WarningIcon } from "@/components/ui/icons";
import { Sparkline } from "@/components/ui/sparkline";
import { Chip, POST_STATUS_CHIP } from "@/components/ui/chip";
import { latestAnomaly } from "@/lib/db/anomalies";
import { listConnectionsForBrand } from "@/lib/db/connections";
import { listDaily, listPostMetrics } from "@/lib/db/metrics";
import { listPostsInRange } from "@/lib/db/posts";
import { getAppContext } from "@/lib/workspace-context";
import { headlineMetrics } from "@/services/analytics";
import type { Platform } from "@/types";

export const metadata = { title: "Dashboard — Signal" };

/**
 * Dashboard — real synced data. Metric cards with sparklines, an anomaly banner,
 * today's queue and top posts. Falls back to a connect prompt / honest empties
 * before any sync has run.
 */
export default async function DashboardPage() {
  const { user, workspace, activeBrand, role } = await getAppContext();

  const greeting = timeGreeting();
  const firstName = user.name?.split(" ")[0] ?? "there";
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const canCompose = role !== "client";

  if (!activeBrand) {
    return (
      <>
        <Header greeting={greeting} name={firstName} today={today} canCompose={canCompose} />
        <ConnectPrompt canManage={role === "owner" || role === "admin"} />
      </>
    );
  }

  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);

  const [connections, dailyFb, dailyIg, posts, anomaly, queue] = await Promise.all([
    listConnectionsForBrand(activeBrand.id),
    listDaily(activeBrand.id, "fb", fromDate, toDate),
    listDaily(activeBrand.id, "ig", fromDate, toDate),
    listPostMetrics(activeBrand.id, 60),
    latestAnomaly(workspace.id),
    todaysQueue(activeBrand.id),
  ]);

  const daily = [...dailyFb, ...dailyIg];
  const headline = headlineMetrics(daily, posts);
  const topPosts = [...posts].sort((a, b) => b.intentScore - a.intentScore).slice(0, 3);
  const hasSynced = daily.length > 0 || posts.length > 0;

  // Show the anomaly banner only for a fresh, unresolved one (within 8 days).
  // The `Date.now()` read is kept in a helper — the purity lint rule forbids it
  // directly in a component body.
  const showAnomaly = anomaly && !anomaly.resolvedAt && isFresh(anomaly.detectedAt);

  return (
    <>
      <Header
        greeting={greeting}
        name={firstName}
        today={`${today} · ${activeBrand.name}`}
        canCompose={canCompose}
      />

      {connections.length === 0 ? (
        <ConnectPrompt canManage={role === "owner" || role === "admin"} />
      ) : (
        <>
          {showAnomaly && (
            <div className="bg-warning-soft mb-[22px] flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] px-4 py-3.5">
              <WarningIcon className="text-warning mt-px size-[18px] shrink-0" />
              <p className="flex-1 text-[0.86rem] leading-relaxed">{anomaly.reasoning}</p>
              <Link href="/pulse" className="text-warning shrink-0 text-[0.82rem] font-semibold">
                Open Pulse
              </Link>
            </div>
          )}

          <section className="mb-[22px] grid grid-cols-2 gap-3.5 md:grid-cols-4">
            <MetricCard
              label="Followers"
              value={hasSynced ? formatNumber(headline.followers) : "—"}
              spark={headline.reachSpark}
              color="var(--chart-1)"
            />
            <MetricCard
              label="Reach · 7 days"
              value={hasSynced ? formatNumber(headline.reach7d) : "—"}
              delta={hasSynced ? headline.reachDeltaPct : undefined}
              spark={headline.reachSpark}
              color="var(--chart-3)"
            />
            <MetricCard
              label="Intent score · avg"
              value={hasSynced && headline.avgIntent > 0 ? String(headline.avgIntent) : "—"}
              spark={posts
                .slice(0, 7)
                .map((p) => p.intentScore)
                .reverse()}
              color="var(--chart-4)"
            />
            <MetricCard
              label="Connected accounts"
              value={String(connections.length)}
              spark={[]}
              color="var(--chart-2)"
            />
          </section>

          <div className="grid gap-3.5 lg:grid-cols-[1.35fr_1fr]">
            <Card>
              <h3 className="mb-3 text-[0.95rem] font-semibold">Today&rsquo;s queue</h3>
              {queue.length === 0 ? (
                <p className="text-text-2 text-[0.86rem]">
                  Nothing scheduled for today.{" "}
                  {canCompose && (
                    <Link
                      href="/planner/compose"
                      className="text-accent font-semibold hover:underline"
                    >
                      Plan a post
                    </Link>
                  )}
                </p>
              ) : (
                queue.map((q) => {
                  const chip = POST_STATUS_CHIP[q.status];
                  return (
                    <div
                      key={q.id}
                      className="border-border flex items-center gap-3 border-b py-2.5 last:border-none last:pb-0"
                    >
                      <span className="font-display text-text-2 w-12 shrink-0 text-[0.85rem] font-semibold">
                        {q.time}
                      </span>
                      {q.platforms.map((p) => (
                        <PlatformIcon key={p} platform={p} size={22} />
                      ))}
                      <p className="flex-1 truncate text-[0.86rem]">{q.label}</p>
                      <Chip variant={chip.variant}>{chip.label}</Chip>
                    </div>
                  );
                })
              )}
            </Card>

            <Card>
              <CardTitle>Top posts this week</CardTitle>
              {topPosts.length === 0 ? (
                <p className="text-text-2 text-[0.86rem]">
                  Top posts appear once metrics have synced.
                </p>
              ) : (
                topPosts.map((p) => (
                  <div
                    key={`${p.postId}_${p.platform}`}
                    className="border-border flex items-center gap-3 border-b py-2.5 last:border-none last:pb-0"
                  >
                    <IntentRing score={p.intentScore} />
                    <p className="flex-1 truncate text-[0.86rem]">{p.title}</p>
                  </div>
                ))
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Header({
  greeting,
  name,
  today,
  canCompose,
}: {
  greeting: string;
  name: string;
  today: string;
  canCompose: boolean;
}) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">
          {greeting}, {name}
        </h1>
        <p className="text-text-2 mt-[3px] text-[0.88rem]">{today}</p>
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
  );
}

function MetricCard({
  label,
  value,
  delta,
  spark,
  color,
}: {
  label: string;
  value: string;
  delta?: number;
  spark: number[];
  color: string;
}) {
  return (
    <Card className="p-5">
      <span className="text-text-2 mb-2 block text-[0.76rem] font-medium">{label}</span>
      <span className="font-display text-[1.75rem] leading-none font-bold tracking-[-0.03em]">
        {value}
      </span>
      {delta !== undefined && delta !== 0 && (
        <span
          className={`mt-1.5 inline-flex items-center gap-[3px] text-[0.76rem] font-semibold ${
            delta > 0 ? "text-success" : "text-danger"
          }`}
        >
          {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}%
        </span>
      )}
      {spark.length >= 2 && (
        <Sparkline points={spark} color={color} className="mt-3 h-[34px] w-full" />
      )}
    </Card>
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

/** Posts scheduled or published for today, for the queue panel. */
async function todaysQueue(brandId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const posts = await listPostsInRange(brandId, startOfDay, endOfDay);

  return posts
    .filter((p) => p.scheduledAt)
    .sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1))
    .map((p) => ({
      id: p.id,
      time: new Date(p.scheduledAt!).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      status: p.status,
      platforms: (Object.keys(p.variants) as (keyof typeof p.variants)[]).map(
        (k) => (k === "facebook" ? "fb" : "ig") as Platform,
      ),
      label: (p.variants.instagram?.caption ?? p.variants.facebook?.caption ?? "Post")
        .split("\n")[0]!
        .slice(0, 40),
    }));
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Within the last 8 days. Kept out of the component body per the purity rule. */
function isFresh(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 8 * 86_400_000;
}
