"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { auth, isFirebaseConfigured } from "@/lib/firebase-client";
import { ROLE_LABEL, type Role, type User } from "@/types";

/**
 * Avatar + account menu. Replicates `.avatar` from the preview.
 *
 * Sign-out has to clear BOTH credentials or the user isn't really signed out:
 * the httpOnly session cookie (server-side, via DELETE) and the Firebase client
 * SDK's own persisted auth state. Dropping only the cookie leaves the SDK able
 * to mint a fresh ID token and silently re-authenticate.
 */
export function UserMenu({ user, role }: { user: User; role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      if (isFirebaseConfigured()) await signOut(auth());
    } finally {
      // Even on failure, get them off the authed shell — then refresh so server
      // components re-render without the session.
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="bg-accent text-accent-fg grid size-8 place-items-center overflow-hidden rounded-full text-[0.82rem] font-semibold"
      >
        {user.avatarUrl ? (
          // Plain <img>: the URL is a Google/Meta CDN we don't control, and
          // next/image would need every one of those hosts whitelisted.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          (user.name?.[0] ?? user.email[0] ?? "?").toUpperCase()
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="border-border bg-surface shadow-card absolute top-[calc(100%+6px)] right-0 z-50 min-w-[220px] rounded-xl border p-1.5"
        >
          <div className="border-border border-b px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-[0.86rem] font-semibold">{user.name}</p>
            <p className="text-text-2 truncate text-[0.74rem]">{user.email}</p>
            <span className="bg-accent-soft text-accent mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold">
              {ROLE_LABEL[role]}
            </span>
          </div>

          <button
            role="menuitem"
            onClick={handleSignOut}
            disabled={busy}
            className="hover:bg-surface-2 mt-1 flex w-full items-center rounded-lg px-2.5 py-2.5 text-left text-[0.86rem] font-medium disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
