"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Role, Workspace } from "@/types";

import { navForRole } from "./nav-config";

/**
 * Desktop sidebar — replicates `.sidebar` from the preview.
 *
 *   236px fixed, sticky full-height, grouped nav, workspace chip pinned bottom.
 *   Hidden below 768px, where BottomNav takes over.
 *
 * A client component only because it needs `usePathname()` for the active
 * state; all its data is passed down from the server layout.
 */

export interface SidebarProps {
  workspace: Workspace;
  role: Role;
  counts: { inbox: number; approvals: number };
}

export function Sidebar({ workspace, role, counts }: SidebarProps) {
  const pathname = usePathname();
  const sections = navForRole(role);

  return (
    <aside className="border-border bg-surface sticky top-0 hidden h-screen flex-col gap-[3px] overflow-y-auto border-r px-3.5 py-5 md:flex">
      <div className="flex items-center gap-[10px] px-2.5 pt-1 pb-[18px]">
        <div className="bg-accent text-accent-fg grid size-[30px] shrink-0 place-items-center rounded-[9px]">
          <LogoMark />
        </div>
        <span className="font-display text-[1.15rem] font-bold tracking-[-0.02em]">Signal</span>
      </div>

      {sections.map((section, i) => (
        <div key={section.title ?? `top-${i}`} className="contents">
          {section.title && (
            <div className="text-text-2 px-3 pt-3.5 pb-[5px] text-[0.66rem] font-semibold tracking-[0.08em] uppercase">
              {section.title}
            </div>
          )}
          {section.items.map((item) => {
            // startsWith so nested routes (/settings/team) keep the parent lit,
            // but exact-match /dashboard so it isn't lit for everything.
            const active =
              item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
            const badgeCount = item.badge ? counts[item.badge] : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-[11px] rounded-[10px] px-3 py-2 text-left text-[0.9rem] font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent font-semibold"
                    : "text-text-2 hover:bg-surface-2 hover:text-text-1",
                )}
              >
                <item.Icon className="size-[17px] shrink-0" />
                {item.label}

                {item.isNew && (
                  <span className="bg-accent-soft text-accent ml-auto rounded-full px-[7px] py-0.5 text-[0.6rem] font-bold tracking-[0.04em]">
                    NEW
                  </span>
                )}

                {/* Zero is deliberately not rendered — an empty inbox shouldn't
                    wear a "0" badge demanding attention. */}
                {!item.isNew && badgeCount > 0 && (
                  <span className="bg-warning-soft text-warning ml-auto rounded-full px-2 py-0.5 text-[0.66rem] font-bold">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="bg-surface-2 mt-auto flex items-center gap-2.5 rounded-xl p-3">
        <div
          className="grid size-[30px] shrink-0 place-items-center rounded-lg text-[0.8rem] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,var(--chart-3),var(--chart-4))" }}
          aria-hidden="true"
        >
          {initials(workspace.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[0.82rem] font-semibold">{workspace.name}</p>
          <p className="text-text-2 text-[0.72rem]">Agency workspace</p>
        </div>
      </div>
    </aside>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
