import { AskSignal } from "@/components/layout/ask-signal";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { countPendingApprovals } from "@/lib/db/approvals";
import { listConnectionsForWorkspace } from "@/lib/db/connections";
import { countOpenInbox } from "@/lib/db/inbox";
import { listNotifications } from "@/lib/db/notifications";
import { getAppContext } from "@/lib/workspace-context";

/**
 * Authed app shell — replicates `.shell` from the preview.
 *
 *   grid-template-columns: 236px 1fr  (single column below 768px)
 *
 * A server component: it resolves session, workspace, role and brands before
 * anything renders, so no page below it ever flashes a signed-out or
 * wrong-brand state. `proxy.ts` already bounced cookie-less requests, but
 * `getAppContext()` is the check that actually counts.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, role, brands, activeBrand } = await getAppContext();

  const [connections, approvals, inbox, notifications] = await Promise.all([
    listConnectionsForWorkspace(workspace.id),
    countPendingApprovals(workspace.id),
    // Inbox items are per-brand; badge the active brand's open count.
    activeBrand ? countOpenInbox(activeBrand.id) : Promise.resolve(0),
    listNotifications(user.uid),
  ]);
  const lastSyncAt = mostRecentSync(connections.map((c) => c.lastSyncAt));

  // Both live now. A zero renders no badge, so the nav stays honest rather than
  // showing the preview's hardcoded counts.
  const counts = { inbox, approvals };

  return (
    <div className="grid min-h-screen md:grid-cols-[236px_1fr]">
      <Sidebar workspace={workspace} role={role} counts={counts} />

      <div className="flex min-w-0 flex-col">
        <Topbar
          brands={brands}
          activeBrandId={activeBrand?.id ?? ""}
          user={user}
          role={role}
          lastSyncAt={lastSyncAt}
          notifications={notifications}
        />

        {/* .content — max-width 1180px, bottom padding clears the mobile nav */}
        <main className="mx-auto w-full max-w-[1180px] px-4 pt-5 pb-[120px] md:px-7 md:pt-[26px] md:pb-[90px]">
          {children}
        </main>
      </div>

      <BottomNav role={role} counts={counts} />

      {/* Ask Signal is available on every authed page, scoped to the active brand. */}
      {activeBrand && <AskSignal brandId={activeBrand.id} userName={user.name} />}
    </div>
  );
}

function mostRecentSync(dates: Array<string | undefined>): string | null {
  const valid = dates.filter((d): d is string => Boolean(d)).sort();
  return valid[valid.length - 1] ?? null;
}
