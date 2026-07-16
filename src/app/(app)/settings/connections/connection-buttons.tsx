"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_LABEL, type Platform } from "@/types";

import { disconnect, startConnect } from "./actions";

/**
 * Connect / disconnect controls.
 *
 * Plain <form action={serverAction}> rather than onClick handlers: the connect
 * flow ends in a server-side redirect() to Meta, which a fetch-based handler
 * cannot follow as a top-level navigation.
 */

export function ConnectButton({ brandId, platform }: { brandId: string; platform: Platform }) {
  return (
    <form action={startConnect} className="mb-3">
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="platform" value={platform} />
      <ConnectSubmit platform={platform} />
    </form>
  );
}

function ConnectSubmit({ platform }: { platform: Platform }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="border-border bg-surface hover:border-accent flex w-full items-center gap-3.5 rounded-[14px] border-[1.5px] border-dashed p-4 text-left transition-colors disabled:opacity-60"
    >
      <PlatformIcon platform={platform} size={38} />
      <div className="flex-1">
        <strong className="block text-[0.9rem]">
          {pending ? "Redirecting…" : `Connect ${PLATFORM_LABEL[platform]}`}
        </strong>
        <span className="text-text-2 text-[0.78rem]">
          {platform === "ig"
            ? "Requires an Instagram Business account linked to a Facebook Page"
            : "Publish to and measure a Facebook Page"}
        </span>
      </div>
      <span className="text-accent text-[0.86rem] font-semibold">Connect</span>
    </button>
  );
}

export function DisconnectButton({
  connectionId,
  accountName,
}: {
  connectionId: string;
  accountName: string;
}) {
  const [confirming, setConfirming] = useState(false);

  // Two-step rather than a native confirm(): disconnecting stops all publishing
  // and syncing for the account, so it shouldn't be one stray click — and
  // window.confirm is blocked in some embedded browsers.
  if (!confirming) {
    return (
      <Button variant="ghost" className="px-3.5 py-2" onClick={() => setConfirming(true)}>
        Disconnect
      </Button>
    );
  }

  return (
    <form action={disconnect} className="flex items-center gap-2">
      <input type="hidden" name="connectionId" value={connectionId} />
      <span className="text-text-2 text-[0.76rem]">Disconnect {accountName}?</span>
      <Button variant="ghost" className="px-3 py-2" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <ConfirmDisconnect />
    </form>
  );
}

function ConfirmDisconnect() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-danger rounded-[10px] px-3.5 py-2 text-[0.88rem] font-semibold text-white disabled:opacity-50"
    >
      {pending ? "Removing…" : "Confirm"}
    </button>
  );
}
