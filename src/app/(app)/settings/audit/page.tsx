import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/dal";
import { listAuditLogs } from "@/lib/db/audit";
import { getAppContext } from "@/lib/workspace-context";
import { ADMIN_ROLES, type AuditLog } from "@/types";

export const metadata = { title: "Audit log — Signal" };

/**
 * Settings → Audit log. Admin-only: a chronological record of security- and
 * billing-relevant changes (connections, membership, brands, plan). Read via the
 * Admin SDK, but guarded here with `requireRole(ADMIN_ROLES)` — the rules restrict
 * client reads to admins, and this server page must match that.
 */
export default async function AuditPage() {
  const { workspace } = await getAppContext();
  await requireRole(workspace.id, ADMIN_ROLES);

  const logs = await listAuditLogs(workspace.id);

  return (
    <>
      <h2 className="text-[1.1rem] font-bold tracking-[-0.01em]">Audit log</h2>
      <p className="text-text-2 mt-0.5 mb-5 text-[0.85rem]">
        Security &amp; billing changes in this workspace, newest first.
      </p>

      {logs.length === 0 ? (
        <Card className="text-center">
          <p className="text-[0.95rem] font-semibold">Nothing logged yet</p>
          <p className="text-text-2 mx-auto mt-1 max-w-[380px] text-[0.85rem]">
            Connecting an account, changing a teammate&rsquo;s role, adding a brand or a plan change
            will appear here.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul>
            {logs.map((log) => (
              <li
                key={log.id}
                className="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 last:border-0"
              >
                <span className="bg-surface-2 text-text-2 rounded-md px-2 py-0.5 font-mono text-[0.72rem]">
                  {log.action}
                </span>
                <span className="text-[0.86rem] font-medium">{log.target}</span>
                {log.metadata?.role && (
                  <span className="text-text-2 text-[0.78rem]">→ {log.metadata.role}</span>
                )}
                <span className="text-text-2 ml-auto text-[0.76rem]">
                  {describeActor(log)} · {formatTime(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function describeActor(log: AuditLog): string {
  // System actors ("Stripe", "Meta") read better without a "by".
  return log.actorId === "stripe" || log.actorId === "meta" ? log.actorName : `by ${log.actorName}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
