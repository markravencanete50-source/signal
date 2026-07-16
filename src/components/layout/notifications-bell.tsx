"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { BellIcon } from "@/components/ui/icons";
import type { Notification } from "@/types";

import { markAllRead, markRead } from "@/app/(app)/notifications-actions";

/**
 * Topbar notifications bell. The list is server-rendered into the layout (bounded
 * at 50), so opening the panel is instant — no fetch. Clicking an item marks it
 * read and follows its link; "Mark all read" clears the dot. Reuses the
 * click-outside/escape pattern from the account menu.
 */
export function NotificationsBell({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.readAt).length;

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

  const openItem = (n: Notification) => {
    setOpen(false);
    startTransition(async () => {
      if (!n.readAt) {
        const fd = new FormData();
        fd.set("id", n.id);
        await markRead(fd);
      }
      if (n.href) router.push(n.href);
      else router.refresh();
    });
  };

  const clearAll = () =>
    startTransition(async () => {
      await markAllRead();
    });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="text-text-2 hover:bg-surface-2 hover:text-text-1 relative grid size-[36px] place-items-center rounded-[10px] transition-colors"
      >
        <BellIcon className="size-[18px]" />
        {unread > 0 && (
          <span
            className="border-surface bg-danger absolute top-1.5 right-1.5 size-2 rounded-full border-2"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="border-border bg-surface shadow-card absolute top-[calc(100%+6px)] right-0 z-50 max-h-[70vh] w-[340px] overflow-hidden rounded-xl border"
        >
          <div className="border-border flex items-center justify-between border-b px-3.5 py-2.5">
            <p className="text-[0.86rem] font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={clearAll}
                disabled={pending}
                className="text-accent text-[0.76rem] font-semibold disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-text-2 px-3.5 py-8 text-center text-[0.84rem]">
              You&rsquo;re all caught up.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className="hover:bg-surface-2 border-border flex w-full gap-2.5 border-b px-3.5 py-3 text-left last:border-0"
                  >
                    <span
                      className={`mt-1.5 size-2 flex-none rounded-full ${
                        n.readAt ? "bg-transparent" : "bg-accent"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.84rem] font-semibold">{n.title}</span>
                      <span className="text-text-2 mt-0.5 block text-[0.8rem] leading-snug">
                        {n.body}
                      </span>
                      <span className="text-text-2 mt-1 block text-[0.72rem]">
                        {relativeTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
