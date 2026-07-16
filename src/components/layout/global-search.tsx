"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { SearchIcon } from "@/components/ui/icons";
import type { SearchResult, SearchType } from "@/services/search";

import { setActiveBrand } from "./brand-actions";

interface Grouped {
  brands: SearchResult[];
  posts: SearchResult[];
  media: SearchResult[];
  reports: SearchResult[];
  total: number;
}

const EMPTY: Grouped = { brands: [], posts: [], media: [], reports: [], total: 0 };

const GROUPS: { key: keyof Omit<Grouped, "total">; label: string }[] = [
  { key: "brands", label: "Brands" },
  { key: "posts", label: "Posts" },
  { key: "media", label: "Media" },
  { key: "reports", label: "Reports" },
];

const TYPE_GLYPH: Record<SearchType, string> = { brand: "◆", post: "✎", media: "▣", report: "▤" };

/**
 * Global search — the topbar box, now live. Debounced calls to `/api/search`
 * (workspace-scoped server-side), a grouped dropdown, and full keyboard nav.
 * Selecting a brand-scoped result switches the active brand before navigating,
 * so a hit in another brand lands you in the right place.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Grouped>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Flat, ordered list mirroring the rendered groups — the target of arrow keys.
  const flat = useMemo(() => GROUPS.flatMap((g) => results[g.key]), [results]);

  // Debounced fetch; an AbortController drops stale responses arriving out of
  // order. All state changes happen inside the timeout callback (never
  // synchronously in the effect body) — results for a <2-char query simply stay
  // hidden by `showDropdown` rather than being cleared with a synchronous set.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Grouped;
        setResults(data);
        setActive(0);
      } catch {
        if (!controller.signal.aborted) setResults(EMPTY);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const select = async (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    if (result.brandId) await setActiveBrand(result.brandId).catch(() => {});
    router.push(result.href);
    router.refresh();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = flat[active];
      if (chosen) void select(chosen);
    }
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative hidden max-w-[320px] flex-1 md:block" ref={ref}>
      <div className="bg-surface-2 text-text-2 flex items-center gap-2 rounded-[10px] px-3 py-2">
        <SearchIcon className="size-[15px] shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search posts, media, reports…"
          aria-label="Search"
          className="placeholder:text-text-2 text-text-1 flex-1 border-none bg-transparent text-[0.86rem] outline-none"
        />
      </div>

      {showDropdown && (
        <div className="border-border bg-surface shadow-card absolute top-[calc(100%+6px)] left-0 z-50 max-h-[70vh] w-[380px] overflow-y-auto rounded-xl border py-1.5">
          {loading && results.total === 0 ? (
            <p className="text-text-2 px-3.5 py-6 text-center text-[0.84rem]">Searching…</p>
          ) : results.total === 0 ? (
            <p className="text-text-2 px-3.5 py-6 text-center text-[0.84rem]">
              No matches for &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            GROUPS.map((group) => {
              const rows = results[group.key];
              if (rows.length === 0) return null;
              return (
                <div key={group.key} className="mb-1 last:mb-0">
                  <p className="text-text-2 px-3.5 pt-1.5 pb-1 text-[0.68rem] font-semibold tracking-wide uppercase">
                    {group.label}
                  </p>
                  {rows.map((r) => {
                    const idx = flat.indexOf(r);
                    return (
                      <button
                        key={`${r.type}-${r.id}`}
                        type="button"
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => void select(r)}
                        className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left ${
                          idx === active ? "bg-surface-2" : ""
                        }`}
                      >
                        <span className="text-text-2 w-4 flex-none text-center text-[0.8rem]">
                          {TYPE_GLYPH[r.type]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.85rem] font-medium">
                            {r.title}
                          </span>
                          {r.subtitle && (
                            <span className="text-text-2 block truncate text-[0.76rem]">
                              {r.subtitle}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
