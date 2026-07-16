import { getAppContext } from "@/lib/workspace-context";
import { listPendingInvites } from "@/lib/db/invites";
import { listTeamMembers } from "@/lib/db/workspaces";
import { ROLE_LABEL } from "@/types";

import { InviteForm, MemberActions } from "./team-client";

export const metadata = { title: "Team — Signal" };

/**
 * Settings → Team. Replicates the preview's `.team-row` list, plus invite
 * management the preview implies but doesn't draw.
 */
export default async function TeamPage() {
  const { workspace, role, user } = await getAppContext();
  const isAdmin = role === "owner" || role === "admin";

  const [members, invites] = await Promise.all([
    listTeamMembers(workspace.id),
    isAdmin ? listPendingInvites(workspace.id) : Promise.resolve([]),
  ]);

  return (
    <>
      {isAdmin && <InviteForm workspaceId={workspace.id} />}

      <h3 className="mt-2 mb-3 text-[0.95rem] font-semibold">Team</h3>

      <div className="border-border bg-surface rounded-2xl border p-5">
        {members.map((member) => (
          <div
            key={member.uid}
            className="border-border flex items-center gap-3 border-b py-2.5 last:border-none"
          >
            <div className="bg-accent text-accent-fg grid size-[34px] shrink-0 place-items-center overflow-hidden rounded-full text-[0.78rem] font-semibold">
              {member.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                (member.name[0] ?? member.email[0] ?? "?").toUpperCase()
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.86rem] font-semibold">
                {member.name}
                {member.uid === user.uid && (
                  <span className="text-text-2 ml-1.5 text-[0.72rem] font-normal">you</span>
                )}
              </p>
              <p className="text-text-2 truncate text-[0.74rem]">
                {member.email || "Invite pending"}
              </p>
            </div>

            {isAdmin && member.uid !== workspace.ownerId && member.uid !== user.uid ? (
              <MemberActions
                workspaceId={workspace.id}
                uid={member.uid}
                currentRole={member.role}
              />
            ) : (
              <span
                className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${
                  member.role === "owner"
                    ? "bg-accent-soft text-accent"
                    : "bg-surface-2 text-text-2"
                }`}
              >
                {ROLE_LABEL[member.role]}
              </span>
            )}
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <>
          <h3 className="mt-6 mb-3 text-[0.95rem] font-semibold">Pending invites</h3>
          <div className="border-border bg-surface rounded-2xl border p-5">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="border-border flex items-center gap-3 border-b py-2.5 last:border-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.86rem] font-semibold">{invite.email}</p>
                  <p className="text-text-2 text-[0.74rem]">
                    Invited as {ROLE_LABEL[invite.role]} · expires{" "}
                    {new Date(invite.expiresAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                <MemberActions workspaceId={workspace.id} inviteId={invite.id} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
