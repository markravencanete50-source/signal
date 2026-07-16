"use client";

import { useActionState } from "react";

import { deleteAutolistAction, toggleAutolistAction, type AutolistState } from "./actions";
import type { Autolist } from "@/types";

/**
 * One autolist row: name, cadence summary, the auto-retire rule, and a switch to
 * pause/resume. Retired items are surfaced so the team knows something needs a
 * rework rather than silently vanishing.
 */
export function AutolistCard({ autolist }: { autolist: Autolist }) {
  const [, toggle] = useActionState<AutolistState, FormData>(toggleAutolistAction, {});
  const [deleteState, remove] = useActionState<AutolistState, FormData>(deleteAutolistAction, {});

  const retiredCount = autolist.items.filter((i) => i.retired).length;
  const activeCount = autolist.items.filter((i) => !i.retired).length;

  return (
    <div className="border-border bg-surface flex items-center gap-4 rounded-2xl border p-4">
      <span className="bg-accent-soft text-accent grid size-[38px] flex-none place-items-center rounded-[11px] text-[1.05rem]">
        {autolist.type === "rss" ? "📡" : "♻️"}
      </span>

      <div className="min-w-0 flex-1">
        <strong className="text-[0.92rem]">{autolist.name}</strong>
        <p className="text-text-2 mt-0.5 text-[0.78rem] leading-relaxed">
          {autolist.type === "rss"
            ? `Auto-fills from ${hostOf(autolist.rssUrl)} · AI rewrites per platform`
            : `${activeCount} posts · repeats every ${autolist.cadenceDays} day${autolist.cadenceDays === 1 ? "" : "s"}`}
          {" · next: "}
          {formatNext(autolist.nextRunAt)}
          {autolist.type === "evergreen" && autolist.retireBelowIntent !== null && (
            <>
              {" · "}
              <b className="text-accent">
                auto-retires posts below {autolist.retireBelowIntent} intent
              </b>
            </>
          )}
          {retiredCount > 0 && (
            <>
              {" · "}
              <b className="text-danger">{retiredCount} retired — needs rework</b>
            </>
          )}
        </p>
        {deleteState.error && (
          <p role="alert" className="text-danger mt-1 text-[0.76rem]">
            {deleteState.error}
          </p>
        )}
      </div>

      <form action={remove}>
        <input type="hidden" name="autolistId" value={autolist.id} />
        <button
          type="submit"
          className="text-text-2 hover:text-danger text-[0.78rem] font-semibold"
        >
          Delete
        </button>
      </form>

      <form action={toggle}>
        <input type="hidden" name="autolistId" value={autolist.id} />
        <input type="hidden" name="enabled" value={autolist.enabled ? "off" : "on"} />
        <button
          type="submit"
          role="switch"
          aria-checked={autolist.enabled}
          aria-label={autolist.enabled ? "Pause autolist" : "Resume autolist"}
          className={`relative h-[24px] w-[42px] rounded-full transition-colors ${
            autolist.enabled ? "bg-accent" : "bg-surface-2"
          }`}
        >
          <span
            className={`absolute top-[3px] size-[18px] rounded-full bg-white transition-all ${
              autolist.enabled ? "left-[21px]" : "left-[3px]"
            }`}
          />
        </button>
      </form>
    </div>
  );
}

function hostOf(url?: string): string {
  if (!url) return "the feed";
  try {
    return new URL(url).host;
  } catch {
    return "the feed";
  }
}

function formatNext(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
