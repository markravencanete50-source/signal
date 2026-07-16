"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MoreIcon, PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Role } from "@/types";

import { MOBILE_PRIMARY, navForRole } from "./nav-config";

/**
 * Mobile bottom navigation — replicates `.bottom-nav` from the preview.
 *
 *   Home · Planner · [center FAB] · Studio · More
 *   Hidden at ≥768px, where the sidebar takes over.
 *
 * The FAB overlaps the bar top (`-mt-[18px]`) exactly as in the preview, and
 * `env(safe-area-inset-bottom)` keeps it clear of the iOS home indicator.
 */

export interface BottomNavProps {
  role: Role;
  counts: { inbox: number; approvals: number };
}

export function BottomNav({ role, counts }: BottomNavProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const primary = MOBILE_PRIMARY.filter((i) => !i.roles || i.roles.includes(role));

  // Everything not already a primary tab goes in the More sheet, so no
  // destination is unreachable on mobile.
  const primaryHrefs = new Set(primary.map((i) => i.href));
  const overflow = navForRole(role)
    .flatMap((s) => s.items)
    .filter((i) => !primaryHrefs.has(i.href));

  // Close the sheet on navigation without an effect. React's "adjust state
  // during render when a prop changes" pattern: compare the current pathname to
  // the one the sheet was anchored at and reset in-render — no cascading effect,
  // no stale-open sheet over the new page.
  const [anchorPath, setAnchorPath] = useState(pathname);
  if (pathname !== anchorPath) {
    setAnchorPath(pathname);
    if (sheetOpen) setSheetOpen(false);
  }

  useEffect(() => {
    if (!sheetOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!sheetRef.current?.contains(e.target as Node)) setSheetOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const canCompose = role !== "client";

  return (
    <>
      {sheetOpen && (
        <div
          ref={sheetRef}
          className="border-border bg-surface shadow-card fixed right-3 bottom-[70px] z-[70] min-w-[190px] rounded-2xl border p-2 md:hidden"
        >
          {overflow.map((item) => {
            const badgeCount = item.badge ? counts[item.badge] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="hover:bg-surface-2 flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[0.86rem] font-medium"
              >
                <item.Icon className="text-text-2 size-[17px]" />
                {item.label}
                {badgeCount > 0 && (
                  <span className="bg-warning-soft text-warning ml-auto rounded-full px-2 py-0.5 text-[0.66rem] font-bold">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <nav
        className="border-border bg-surface fixed inset-x-0 bottom-0 z-[60] flex justify-around border-t px-2.5 pt-2 md:hidden"
        style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
      >
        {primary.slice(0, 2).map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} />
        ))}

        {canCompose && (
          <Link
            href="/planner/compose"
            aria-label="New post"
            className="bg-accent text-accent-fg -mt-[18px] grid size-[46px] place-items-center rounded-[15px]"
            style={{ boxShadow: "0 4px 14px rgba(79,70,229,.4)" }}
          >
            <PlusIcon className="size-5" />
          </Link>
        )}

        {primary.slice(2).map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} />
        ))}

        <button
          type="button"
          onClick={() => setSheetOpen((v) => !v)}
          aria-expanded={sheetOpen}
          aria-label="More"
          className={cn(
            "flex flex-col items-center gap-[3px] rounded-[10px] px-2.5 py-1 text-[0.62rem] font-semibold",
            sheetOpen ? "text-accent" : "text-text-2",
          )}
        >
          <MoreIcon className="size-5" />
          More
        </button>
      </nav>
    </>
  );
}

function NavTab({ item, pathname }: { item: (typeof MOBILE_PRIMARY)[number]; pathname: string }) {
  const active =
    item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-[3px] rounded-[10px] px-2.5 py-1 text-[0.62rem] font-semibold",
        active ? "text-accent" : "text-text-2",
      )}
    >
      <item.Icon className="size-5" />
      {item.label}
    </Link>
  );
}
