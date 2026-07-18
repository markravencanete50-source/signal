"use client";

import Link from "next/link";

import { Chip, POST_STATUS_CHIP } from "@/components/ui/chip";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { useHydrated } from "@/lib/use-hydrated";
import type { Platform, PostStatus } from "@/types";

/**
 * Client-side pieces of the dashboard whose output depends on the USER'S clock
 * and timezone. The server renders in UTC (serverless), which for anyone away
 * from Greenwich produced wrong greetings, wrong dates and queue times up to
 * half a day off — these gate on hydration and compute locally instead.
 */

export function LocalGreeting({ name, suffix }: { name: string; suffix?: string }) {
  const hydrated = useHydrated();
  const text = hydrated ? greetingText() : null;

  return (
    <>
      <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">
        {text?.greeting ?? "Hello"}, {name}
      </h1>
      <p className="text-text-2 mt-[3px] min-h-[1.2em] text-[0.88rem]">
        {text ? `${text.today}${suffix ? ` · ${suffix}` : ""}` : ""}
      </p>
    </>
  );
}

export interface QueueItem {
  id: string;
  scheduledAt: string;
  status: PostStatus;
  platforms: Platform[];
  label: string;
}

/**
 * Today's queue, where "today" is the BROWSER'S today. Receives a ±1-day window
 * from the server and filters/formats locally. Every row links to the composer
 * in edit mode — posts are clickable everywhere they appear.
 */
export function TodayQueue({ items, canCompose }: { items: QueueItem[]; canCompose: boolean }) {
  const hydrated = useHydrated();

  if (!hydrated) {
    return <div className="bg-surface-2 h-10 rounded-[10px] motion-safe:animate-pulse" />;
  }

  const today = localDayKey(new Date());
  const todays = items
    .filter((q) => localDayKey(new Date(q.scheduledAt)) === today)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  if (todays.length === 0) {
    return (
      <p className="text-text-2 text-[0.86rem]">
        Nothing scheduled for today.{" "}
        {canCompose && (
          <Link href="/planner/compose" className="text-accent font-semibold hover:underline">
            Plan a post
          </Link>
        )}
      </p>
    );
  }

  return (
    <>
      {todays.map((q) => {
        const chip = POST_STATUS_CHIP[q.status];
        return (
          <Link
            key={q.id}
            href={`/planner/compose?edit=${q.id}`}
            className="border-border hover:bg-surface-2 -mx-2 flex items-center gap-3 rounded-[10px] border-b px-2 py-2.5 transition-colors last:border-none last:pb-0"
          >
            <span className="font-display text-text-2 w-12 shrink-0 text-[0.85rem] font-semibold">
              {new Date(q.scheduledAt).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {q.platforms.map((p) => (
              <PlatformIcon key={p} platform={p} size={22} />
            ))}
            <p className="flex-1 truncate text-[0.86rem]">{q.label}</p>
            <Chip variant={chip.variant}>{chip.label}</Chip>
          </Link>
        );
      })}
    </>
  );
}

function greetingText(): { greeting: string; today: string } {
  const now = new Date();
  const h = now.getHours();
  return {
    greeting: h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening",
    today: now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
  };
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
