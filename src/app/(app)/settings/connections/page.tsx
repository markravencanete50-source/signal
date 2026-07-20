import { SUPPORTED_PLATFORMS } from "@/adapters/registry";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { listConnectionsForBrand, toPublicConnection } from "@/lib/db/connections";
import { isMockMode } from "@/lib/env";
import { getAppContext } from "@/lib/workspace-context";
import { PLATFORM_LABEL, type PublicConnection } from "@/types";

import { ConnectButton, DisconnectButton } from "./connection-buttons";
import { DemoDataButton } from "./demo-data";
import { SyncNowButton } from "./sync-now";

export const metadata = { title: "Connections — Signal" };

/**
 * Settings → Connections. Replicates `.conn` cards from the preview.
 *
 * Every connection crossing to the client goes through `toPublicConnection()`,
 * which strips the encrypted token by explicit field selection. The browser
 * never receives `accessTokenEnc`, even in ciphertext.
 */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { activeBrand, role } = await getAppContext();
  const params = await searchParams;

  const canManage = role === "owner" || role === "admin";

  if (!activeBrand) {
    return (
      <EmptyState
        title="No brand yet"
        body="Create a brand before connecting social accounts."
        href="/settings/brands"
        cta="Add a brand"
      />
    );
  }

  const connections = (await listConnectionsForBrand(activeBrand.id)).map(toPublicConnection);
  const connectedPlatforms = new Set(connections.map((c) => c.platform));
  const available = SUPPORTED_PLATFORMS.filter((p) => !connectedPlatforms.has(p));

  return (
    <>
      <div className="mb-[22px]">
        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Settings</h1>
        <p className="text-text-2 mt-[3px] text-[0.88rem]">
          Connections · team · brand — {activeBrand.name}
        </p>
      </div>

      {params.connected && (
        <div className="bg-success-soft text-success mb-4 rounded-[10px] px-3 py-2.5 text-[0.82rem] font-medium">
          {params.connected}
        </div>
      )}
      {params.error && (
        <div
          role="alert"
          className="bg-danger-soft text-danger mb-4 rounded-[10px] px-3 py-2.5 text-[0.82rem] font-medium"
        >
          {params.error}
        </div>
      )}

      {isMockMode() && (
        <div className="bg-accent-soft text-accent mb-4 flex gap-2 rounded-[10px] px-3 py-2.5 text-[0.78rem] leading-relaxed font-medium">
          <span>
            <strong>Mock mode.</strong> Connecting simulates the full OAuth round-trip and stores a
            real encrypted token, without calling Meta. Set <code>USE_MOCK_ADAPTERS=false</code>{" "}
            once App Review clears.
          </span>
        </div>
      )}

      {isMockMode() && canManage && <DemoDataButton brandId={activeBrand.id} />}

      <h3 className="mb-3 text-[0.95rem] font-semibold">Connected accounts</h3>

      {canManage && connections.length > 0 && <SyncNowButton brandId={activeBrand.id} />}

      {connections.length === 0 && (
        <p className="text-text-2 mb-3 text-[0.85rem]">
          No accounts connected yet. Signal can&rsquo;t publish or measure anything until you
          connect one.
        </p>
      )}

      {connections.map((conn) => (
        <ConnectionCard key={conn.id} connection={conn} canManage={canManage} />
      ))}

      {canManage &&
        available.map((platform) => (
          <ConnectButton key={platform} brandId={activeBrand.id} platform={platform} />
        ))}
    </>
  );
}

/** `.conn` — platform badge, account, health, action. */
function ConnectionCard({
  connection,
  canManage,
}: {
  connection: PublicConnection;
  canManage: boolean;
}) {
  const health = describeHealth(connection);

  return (
    <div className="border-border bg-surface mb-3 flex flex-wrap items-center gap-3.5 rounded-[14px] border p-4">
      <PlatformIcon platform={connection.platform} size={38} />

      <div className="min-w-[150px] flex-1">
        <strong className="block text-[0.9rem]">{connection.accountName}</strong>
        <span className="text-text-2 text-[0.78rem]">
          {PLATFORM_LABEL[connection.platform]}
          {connection.platform === "ig" ? " Business · linked to FB Page" : " Page"}
          {connection.connectedByName ? ` · connected by ${connection.connectedByName}` : ""}
        </span>
        <span className="text-text-2 mt-0.5 block text-[0.72rem]">
          {connection.lastSyncAt
            ? `Metrics synced ${checkedAgo(connection.lastSyncAt)}`
            : "Not synced yet — runs hourly, or use Run sync now"}
        </span>
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <span
          className={`flex items-center gap-1.5 text-[0.76rem] font-semibold ${health.className}`}
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: health.dot }}
            aria-hidden="true"
          />
          {health.label}
        </span>
        {connection.tokenHealthCheckedAt && (
          <span className="text-text-2 text-[0.68rem]">
            checked {checkedAgo(connection.tokenHealthCheckedAt)}
          </span>
        )}
      </div>

      {canManage && (
        <DisconnectButton connectionId={connection.id} accountName={connection.accountName} />
      )}
    </div>
  );
}

/**
 * Health copy for a connection.
 *
 * The amber "expires in N days" band is what makes the token cron visible to
 * users before publishing silently breaks — the whole point of surfacing expiry
 * rather than only reporting failure after the fact.
 */
function describeHealth(conn: PublicConnection): { label: string; className: string; dot: string } {
  if (conn.status === "error") {
    return { label: conn.lastError ?? "Error", className: "text-danger", dot: "var(--danger)" };
  }
  if (conn.status === "expired") {
    return { label: "Token expired — reconnect", className: "text-danger", dot: "var(--danger)" };
  }
  if (conn.daysUntilExpiry <= 0) {
    return { label: "Token expired — reconnect", className: "text-danger", dot: "var(--danger)" };
  }
  if (conn.daysUntilExpiry <= 10) {
    return {
      label: `Expires in ${conn.daysUntilExpiry} day${conn.daysUntilExpiry === 1 ? "" : "s"}`,
      className: "text-warning",
      dot: "var(--warning)",
    };
  }
  return {
    label: `Token healthy · ${conn.daysUntilExpiry} days`,
    className: "text-success",
    dot: "var(--success)",
  };
}

/** Compact "checked 3h ago" relative time for the health monitor's last run. */
function checkedAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function EmptyState({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="border-border grid min-h-[180px] w-full place-items-center rounded-2xl border-[1.5px] border-dashed p-8 text-center">
      <div>
        <p className="text-[0.95rem] font-semibold">{title}</p>
        <p className="text-text-2 mx-auto mt-1 max-w-[320px] text-[0.85rem]">{body}</p>
        <a
          href={href}
          className="bg-accent text-accent-fg mt-4 inline-flex items-center rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold"
        >
          {cta}
        </a>
      </div>
    </div>
  );
}
