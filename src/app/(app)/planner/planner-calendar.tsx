"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Platform, PostStatus } from "@/types";

import { rescheduleAction } from "./actions";

/**
 * Planner month grid — replicates the preview's `.cal`. Post chips colour-coded
 * by status, a platform filter, and HTML5 drag-and-drop to reschedule (drop a
 * chip on a day → the post's scheduledAt moves to that day, same time-of-day).
 */

export interface CalendarPost {
  id: string;
  scheduledAt: string;
  status: PostStatus;
  platforms: Platform[];
  label: string;
}

const STATUS_CHIP: Record<PostStatus, string> = {
  draft: "bg-surface-2 text-text-2",
  pending_approval: "bg-warning-soft text-warning",
  approved: "bg-accent-soft text-accent",
  scheduled: "bg-accent-soft text-accent",
  publishing: "bg-accent-soft text-accent",
  published: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PlannerCalendar({
  month,
  posts,
  brandName,
  canCompose,
}: {
  month: string;
  posts: CalendarPost[];
  brandName: string;
  canCompose: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | Platform>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [year, m] = month.split("-").map(Number) as [number, number];
  const monthIndex = m - 1;

  const cells = buildMonthCells(year, monthIndex);
  const todayKey = dateKey(new Date());

  const visible = posts.filter((p) => filter === "all" || p.platforms.includes(filter));
  const byDay = groupByDay(visible);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, monthIndex + delta, 1));
    router.push(
      `/planner?month=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }

  async function drop(dayIso: string, postId: string) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    // Preserve the original time-of-day; only move the date.
    const original = new Date(post.scheduledAt);
    const target = new Date(dayIso);
    target.setHours(original.getHours(), original.getMinutes(), 0, 0);

    setBusy(true);
    const res = await rescheduleAction(postId, target.toISOString());
    setBusy(false);
    setDragId(null);
    if (!res.error) router.refresh();
  }

  const monthName = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Planner</h1>
          <p className="text-text-2 mt-[3px] text-[0.88rem]">
            Drag to reschedule · click to edit{brandName ? ` · ${brandName}` : ""}
          </p>
        </div>
        {canCompose && (
          <Link
            href="/planner/compose"
            className="bg-accent text-accent-fg inline-flex items-center gap-2 rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold"
          >
            <PlusIcon className="size-[15px]" />
            New post
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-[1.15rem] font-bold">{monthName}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="border-border text-text-2 hover:bg-surface-2 grid size-[30px] place-items-center rounded-lg border"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="size-3.5"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="border-border text-text-2 hover:bg-surface-2 grid size-[30px] place-items-center rounded-lg border"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="size-3.5"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <div className="ml-auto flex gap-2">
          {(["all", "fb", "ig"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3.5 py-[7px] text-[0.82rem] font-medium transition-colors",
                filter === f
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border bg-surface text-text-2 hover:border-text-2",
              )}
            >
              {f === "all" ? "All" : f === "fb" ? "Facebook" : "Instagram"}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "border-border bg-surface overflow-hidden rounded-2xl border",
          busy && "opacity-70",
        )}
      >
        <div className="border-border grid grid-cols-7 border-b">
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="text-text-2 p-2.5 text-center text-[0.7rem] font-semibold tracking-[0.06em] uppercase"
            >
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const dayPosts = cell.inMonth ? (byDay.get(cell.iso) ?? []) : [];
            return (
              <div
                key={i}
                onDragOver={(e) => {
                  if (cell.inMonth && dragId) e.preventDefault();
                }}
                onDrop={() => dragId && cell.inMonth && drop(cell.iso, dragId)}
                className={cn(
                  "border-border min-h-[96px] border-r border-b p-[7px] text-[0.76rem] [&:nth-child(7n)]:border-r-0",
                  !cell.inMonth && "bg-surface-2 opacity-50",
                )}
              >
                <span
                  className={cn(
                    "font-display text-text-2 mb-1.5 block font-semibold",
                    cell.iso === todayKey &&
                      "bg-accent text-accent-fg grid size-[22px] place-items-center rounded-full",
                  )}
                >
                  {cell.day}
                </span>

                {dayPosts.map((post) => (
                  <button
                    key={post.id}
                    draggable={isMovable(post.status)}
                    onDragStart={() => setDragId(post.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => router.push(`/planner/compose?edit=${post.id}`)}
                    title={post.label}
                    className={cn(
                      "mb-1 flex w-full items-center gap-1.5 truncate rounded-[7px] px-1.5 py-[3px] text-left text-[0.68rem] font-semibold transition-transform hover:translate-x-0.5",
                      STATUS_CHIP[post.status],
                      isMovable(post.status) ? "cursor-grab" : "cursor-pointer",
                    )}
                  >
                    <span className="truncate">{post.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-text-2 mt-3.5 flex flex-wrap gap-4 text-[0.76rem]">
        <LegendItem color="var(--success)" label="Published" />
        <LegendItem color="var(--accent)" label="Scheduled" />
        <LegendItem color="var(--warning)" label="Awaiting approval" />
        <LegendItem color="var(--text-2)" label="Draft" />
        <LegendItem color="var(--danger)" label="Failed" />
      </div>
    </>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className="inline-block size-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Only future-facing posts can be dragged. */
function isMovable(status: PostStatus): boolean {
  return ["draft", "scheduled", "pending_approval", "approved"].includes(status);
}

interface Cell {
  day: number;
  iso: string;
  inMonth: boolean;
}

/**
 * Build a 6-week grid (Mon-first) covering the month, with leading/trailing days
 * from adjacent months dimmed. Matches the preview's 5–6 row layout.
 */
function buildMonthCells(year: number, monthIndex: number): Cell[] {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  // getUTCDay: 0=Sun..6=Sat. Convert to Mon-first offset.
  const leading = (first.getUTCDay() + 6) % 7;

  const cells: Cell[] = [];
  const start = new Date(first);
  start.setUTCDate(1 - leading);

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    cells.push({
      day: d.getUTCDate(),
      iso: dateKey(d),
      inMonth: d.getUTCMonth() === monthIndex,
    });
    // Stop after the last week that still contains a day of this month.
    if (i >= 34 && d.getUTCMonth() !== monthIndex && d.getUTCDay() === 0) break;
  }
  return cells;
}

/** Local-date key YYYY-MM-DD from a Date's UTC parts. */
function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function groupByDay(posts: CalendarPost[]): Map<string, CalendarPost[]> {
  const map = new Map<string, CalendarPost[]>();
  for (const p of posts) {
    const key = p.scheduledAt.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return map;
}
