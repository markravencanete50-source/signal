import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoMark } from "@/components/ui/icons";
import { verifySession, getCurrentUser } from "@/lib/auth/dal";
import { findInviteByToken, markInviteAccepted, validateInvite } from "@/lib/db/invites";
import { getMember } from "@/lib/db/workspaces";
import { ROLE_LABEL } from "@/types";

import { AcceptInvite } from "./accept-client";

export const metadata = { title: "Accept invitation — Signal" };

/**
 * Invite acceptance.
 *
 * Outside `(app)` — the invitee may not be signed in, or may not belong to any
 * workspace yet, so the authed shell can't render for them.
 *
 * Security: the token proves the link is genuine, but NOT that the person
 * holding it is who it was sent to. So acceptance requires a signed-in session
 * whose email matches the invited address (`validateInvite`), and membership is
 * granted here server-side — never trusting the client to add itself.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await findInviteByToken(token);
  const session = await verifySession();

  // Not signed in → send to login, returning here afterwards so the flow resumes.
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const user = await getCurrentUser();
  const check = validateInvite(invite, session.email);

  if (!check.ok) {
    return <InviteError reason={check.reason} userEmail={session.email} />;
  }

  const { invite: valid } = check;

  // Already a member (e.g. re-clicked link) — accept idempotently and move on
  // rather than erroring.
  const existing = await getMember(valid.workspaceId, session.uid);
  if (existing) {
    await markInviteAccepted(valid.id, session.uid);
    redirect("/dashboard");
  }

  return (
    <div className="bg-bg flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex items-center gap-[10px]">
          <div className="bg-accent text-accent-fg grid size-[30px] place-items-center rounded-[9px]">
            <LogoMark />
          </div>
          <span className="font-display text-[1.15rem] font-bold tracking-[-0.02em]">Signal</span>
        </div>

        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Join {valid.workspaceName}</h1>
        <p className="text-text-2 mt-[3px] mb-6 text-[0.88rem]">
          {valid.invitedByName} invited you as{" "}
          <strong className="text-text-1">{ROLE_LABEL[valid.role]}</strong>. You&rsquo;re signed in
          as {user?.email ?? session.email}.
        </p>

        <AcceptInvite token={token} workspaceName={valid.workspaceName} />
      </div>
    </div>
  );
}

function InviteError({ reason, userEmail }: { reason: string; userEmail: string }) {
  const messages: Record<string, string> = {
    not_found: "This invitation link isn't valid. Ask whoever invited you to send a new one.",
    expired: "This invitation has expired. Ask for a fresh invite.",
    already_accepted: "This invitation has already been used.",
    wrong_email: `This invitation was sent to a different email address. You're signed in as ${userEmail} — sign in with the invited address to accept.`,
  };

  return (
    <div className="bg-bg flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px] text-center">
        <h1 className="text-[1.4rem] font-bold tracking-[-0.02em]">Invitation unavailable</h1>
        <p className="text-text-2 mx-auto mt-2 max-w-[340px] text-[0.88rem]">
          {messages[reason] ?? "This invitation can't be used."}
        </p>
        <Link
          href="/dashboard"
          className="bg-accent text-accent-fg mt-5 inline-flex rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold"
        >
          Go to Signal
        </Link>
      </div>
    </div>
  );
}
