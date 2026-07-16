"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { acceptInvite } from "./actions";

/**
 * Accept button. A form posting to a server action, not an onClick fetch — the
 * action adds the membership server-side and redirects into the app, which a
 * client handler couldn't do atomically.
 */
export function AcceptInvite({ token, workspaceName }: { token: string; workspaceName: string }) {
  return (
    <form action={acceptInvite} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <AcceptButton workspaceName={workspaceName} />
      <a
        href="/dashboard"
        className="text-text-2 hover:text-text-1 text-center text-[0.82rem] font-medium"
      >
        Not now
      </a>
    </form>
  );
}

function AcceptButton({ workspaceName }: { workspaceName: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Joining…" : `Join ${workspaceName}`}
    </Button>
  );
}
