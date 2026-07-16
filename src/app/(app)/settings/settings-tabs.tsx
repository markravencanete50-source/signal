"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

/** Settings sub-nav — reuses the preview's `.fchip` filter-chip styling. */
const TABS = [
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/brands", label: "Brands" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/audit", label: "Audit log", adminOnly: true },
];

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="mb-[18px] flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3.5 py-[7px] text-[0.82rem] font-medium transition-colors",
              active
                ? "border-accent bg-accent text-accent-fg"
                : "border-border bg-surface text-text-2 hover:border-text-2",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
