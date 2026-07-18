"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useHydrated } from "@/lib/use-hydrated";
import type { Platform, PostStatus } from "@/types";

import { rescheduleAction } from "./actions";

/**
 * Planner calendar — month, week and day views of a brand's posts, colour-coded
 * by status, with HTML5 drag-and-drop to reschedule and click-to-edit.
 *
 * ALL date maths here is deliberately LOCAL-time: posts are bucketed, "today" is
 * ringed and drops are computed in the browser's timezone. The server only
 * fetches a generously-buffered range; rendering is gated behind mount so the
 * server's UTC clock can never paint a grid the client would disagree with.
 */

export interface CalendarPost {
  id: string;
  scheduledAt: string;
  status: PostStatus;
  platforms: Platform[];
  label: string;
}

export type CalendarView = "month" | "week" | "day";

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
  view,
  anchor,
  posts,
  brandName,
  canCompose,
}: {
  view: CalendarView;
  /** YYYY-MM-DD anchor date, or "" meaning "the browser's today". */
  anchor: string;
  posts: CalendarPost[];
  brandName: string;
  canCompose: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | Platform>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The default anchor is "the user's today", which the server cannot know
  // (it renders in UTC). Gate the grid behind hydration so SSR and client
  // never disagree about what day it is.
  const mounted = useHydrated();

  const anchorDate = anchor ? parseLocalKey(anchor) : new Date();
  const todayKey = localKey(new Date());

  const visible = posts.filter((p) => filter === "all" || p.platforms.includes(filter));
  const byDay = groupByLocalDay(visible);

  function navigate(nextView: CalendarView, nextAnchor: Date) {
    router.push(`/planner?view=${nextView}&date=${localKey(nextAnchor)}`);
  }

  function shift(delta: number) {
    const d = new Date(anchorDate);
    if (view === "month") d.setMonth(d.getMonth() + delta, 1);
    if (view === "week") d.setDate(d.getDate() + delta * 7);
    if (view === "day") d.setDate(d.getDate() + delta);
    navigate(view, d);
  }

  async function drop(dayKey: string, postId: string) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    // Move the date, keep the local time-of-day.
    const original = new Date(post.scheduledAt);
    const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
    const target = new Date(y, m - 1, d, original.getHours(), original.getMinutes());

    setBusy(true);
    const res = await rescheduleAction(postId, target.toISOString());
    setBusy(false);
    setDragId(null);
    if (!res.error) router.refresh();
  }

  const heading = mounted ? headingFor(view, anchorDate) : "";

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
            className="bg-accent text-accent-fg inline-flex items-center gap-2 rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold transition-transform active:scale-[.97]"
          >
            <PlusIcon className="size-[15px]" />
            New post
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="min-w-[150px] text-[1.05rem] font-bold sm:text-[1.15rem]">{heading}</h2>
        <div className="flex gap-1">
          <NavButton dir="prev" onClick={() => shift(-1)} />
          <button
            onClick={() => navigate(view, new Date())}
            className="border-border text-text-2 hover:bg-surface-2 rounded-lg border px-2.5 text-[0.78rem] font-semibold transition-colors"
          >
            Today
          </button>
          <NavButton dir="next" onClick={() => shift(1)} />
        </div>

        {/* view switcher */}
        <div className="bg-surface-2 flex gap-0.5 rounded-[10px] p-[3px]">
          {(["month", "week", "day"] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => navigate(v, anchorDate)}
              aria-pressed={view === v}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold capitalize transition-colors",
                view === v ? "bg-surface text-text-1 shadow-sm" : "text-text-2",
              )}
            >
              {v}
            </button>
          ))}
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

      {!mounted ? (
        <div className="border-border bg-surface h-[420px] rounded-2xl border motion-safe:animate-pulse" />
      ) : (
        <div
          key={`${view}-${localKey(anchorDate)}`}
          className="motion-safe:animate-[fadeSlideIn_.28s_ease]"
        >
          {view === "day" ? (
            <DayAgenda
              dayKey={localKey(anchorDate)}
              posts={byDay.get(localKey(anchorDate)) ?? []}
              onOpen={(id) => router.push(`/planner/compose?edit=${id}`)}
            />
          ) : (
            <div className="overflow-x-auto">
              <div
                className={cn(
                  "border-border bg-surface min-w-[560px] overflow-hidden rounded-2xl border",
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
                  {(view === "month"
                    ? buildMonthCells(anchorDate.getFullYear(), anchorDate.getMonth())
                    : buildWeekCells(anchorDate)
                  ).map((cell, i) => {
                    const dayPosts = byDay.get(cell.key) ?? [];
                    return (
                      <div
                        key={i}
                        onDragOver={(e) => {
                          if (dragId) e.preventDefault();
                        }}
                        onDrop={() => dragId && drop(cell.key, dragId)}
                        className={cn(
                          "border-border border-r border-b p-[7px] text-[0.76rem] [&:nth-child(7n)]:border-r-0",
                          view === "month" ? "min-h-[96px]" : "min-h-[220px]",
                          !cell.inMonth && "bg-surface-2 opacity-50",
                        )}
                      >
                        <button
                          onClick={() => navigate("day", parseLocalKey(cell.key))}
                          aria-label={`Open ${cell.key}`}
                          className={cn(
                            "font-display text-text-2 hover:text-accent mb-1.5 block font-semibold transition-colors",
                            cell.key === todayKey &&
                              "bg-accent text-accent-fg grid size-[22px] place-items-center rounded-full",
                          )}
                        >
                          {cell.day}
                        </button>

                        {dayPosts.map((post) => (
                          <PostChip
                            key={post.id}
                            post={post}
                            showTime={view === "week"}
                            onDragStart={() => setDragId(post.id)}
                            onDragEnd={() => setDragId(null)}
                            onClick={() => router.push(`/planner/compose?edit=${post.id}`)}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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

function PostChip({
  post,
  showTime,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  post: CalendarPost;
  showTime: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const time = formatTime(post.scheduledAt);
  return (
    <button
      draggable={isMovable(post.status)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={`${time} · ${post.label}`}
      className={cn(
        "mb-1 flex w-full items-center gap-1.5 truncate rounded-[7px] px-1.5 py-[3px] text-left text-[0.68rem] font-semibold transition-[transform,box-shadow] hover:translate-x-0.5 hover:shadow-sm",
        STATUS_CHIP[post.status],
        isMovable(post.status) ? "cursor-grab" : "cursor-pointer",
      )}
    >
      {showTime && <span className="shrink-0 opacity-75">{time}</span>}
      <span className="truncate">{post.label}</span>
    </button>
  );
}

/** Day view — a simple time-ordered agenda; the natural mobile layout. */
function DayAgenda({
  dayKey,
  posts,
  onOpen,
}: {
  dayKey: string;
  posts: CalendarPost[];
  onOpen: (id: string) => void;
}) {
  const sorted = [...posts].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return (
    <div className="border-border bg-surface overflow-hidden rounded-2xl border">
      {sorted.length === 0 ? (
        <p className="text-text-2 px-5 py-10 text-center text-[0.88rem]">
          Nothing planned for this day.
        </p>
      ) : (
        sorted.map((post) => (
          <button
            key={post.id}
            onClick={() => onOpen(post.id)}
            className="border-border hover:bg-surface-2 flex w-full items-center gap-3.5 border-b px-4 py-3.5 text-left transition-colors last:border-none"
          >
            <span className="font-display text-text-2 w-14 shrink-0 text-[0.9rem] font-semibold">
              {formatTime(post.scheduledAt)}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-[7px] px-2 py-0.5 text-[0.68rem] font-bold capitalize",
                STATUS_CHIP[post.status],
              )}
            >
              {post.status.replace("_", " ")}
            </span>
            <span className="flex-1 truncate text-[0.88rem]">{post.label}</span>
          </button>
        ))
      )}
      <span className="sr-only">{dayKey}</span>
    </div>
  );
}

function NavButton({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === "prev" ? "Previous" : "Next"}
      className="border-border text-text-2 hover:bg-surface-2 grid size-[30px] place-items-center rounded-lg border transition-colors"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="size-3.5"
      >
        <path d={dir === "prev" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
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
  key: string;
  inMonth: boolean;
}

/** Month grid in LOCAL time, Mon-first, trimmed to the weeks the month spans. */
function buildMonthCells(year: number, monthIndex: number): Cell[] {
  const first = new Date(year, monthIndex, 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const rows = Math.ceil((leading + daysInMonth) / 7);

  const cells: Cell[] = [];
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(year, monthIndex, 1 - leading + i);
    cells.push({ day: d.getDate(), key: localKey(d), inMonth: d.getMonth() === monthIndex });
  }
  return cells;
}

/** The Mon–Sun week containing the anchor, in LOCAL time. */
function buildWeekCells(anchor: Date): Cell[] {
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));

  const cells: Cell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    cells.push({ day: d.getDate(), key: localKey(d), inMonth: true });
  }
  return cells;
}

function headingFor(view: CalendarView, anchor: Date): string {
  if (view === "month") {
    return anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  if (view === "week") {
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date, withMonth: boolean) =>
      d.toLocaleDateString("en-GB", { day: "numeric", ...(withMonth ? { month: "short" } : {}) });
    return `${fmt(monday, monday.getMonth() !== sunday.getMonth())} – ${fmt(sunday, true)} ${sunday.getFullYear()}`;
  }
  return anchor.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** YYYY-MM-DD from a Date's LOCAL parts. */
function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse YYYY-MM-DD as a LOCAL date (new Date("YYYY-MM-DD") would be UTC). */
function parseLocalKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** Bucket posts by the LOCAL date their scheduledAt falls on. */
function groupByLocalDay(posts: CalendarPost[]): Map<string, CalendarPost[]> {
  const map = new Map<string, CalendarPost[]>();
  for (const p of posts) {
    const key = localKey(new Date(p.scheduledAt));
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return map;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
