"use client";

import { useState } from "react";

import { Card } from "@/components/ui/card";
import type { InboxItem } from "@/lib/db/inbox";

import { InboxItemRow } from "./inbox-item";

type Filter = "all" | "lead" | "negative";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "lead", label: "Leads" },
  { key: "negative", label: "Needs care" },
];

/**
 * The inbox list with sentiment filter chips. Open items surface first (they
 * need action); within that, the sync engine already ordered by recency. The
 * filter is client-side over an already-loaded page — the list is bounded and
 * re-fetching per chip would just add latency.
 */
export function InboxList({ items }: { items: InboxItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const shown = items
    .filter((i) => (filter === "all" ? true : i.sentiment === filter))
    .sort((a, b) => rank(a) - rank(b));

  return (
    <>
      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors ${
              filter === f.key
                ? "bg-accent text-accent-fg"
                : "border-border text-text-2 hover:bg-surface-2 border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="py-1">
        {shown.length === 0 ? (
          <p className="text-text-2 py-8 text-center text-[0.85rem]">
            Nothing here — you&rsquo;re all caught up.
          </p>
        ) : (
          shown.map((item, i) => <InboxItemRow key={item.id} item={item} tintIndex={i} />)
        )}
      </Card>
    </>
  );
}

/** Open items before handled ones, so the queue reads as a to-do list. */
function rank(item: InboxItem): number {
  return item.status === "open" || item.status === "assigned" ? 0 : 1;
}
