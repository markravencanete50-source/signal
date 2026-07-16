"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Brand } from "@/types";

import { setActiveBrand } from "./brand-actions";

/**
 * Brand switcher — replicates `.brand-btn` / `.brand-menu` from the preview.
 *
 * The active brand is stored in an httpOnly cookie by a server action rather
 * than in React state or localStorage. Two reasons:
 *   - the build rules forbid localStorage for app state
 *   - every page is server-rendered per brand, so the server must know which
 *     brand *before* it renders; client state would force a second pass
 */

export interface BrandSwitcherProps {
  brands: Brand[];
  activeBrandId: string;
  canAddBrand: boolean;
}

export function BrandSwitcher({ brands, activeBrandId, canAddBrand }: BrandSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0];

  // Close on outside click or Escape. Both are needed: the preview closes on
  // document click, and keyboard users need a way out that isn't a mouse.
  useEffect(() => {
    if (!open) return;

    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!active) return null;

  async function choose(brandId: string) {
    setOpen(false);
    if (brandId === activeBrandId) return;

    setPending(true);
    await setActiveBrand(brandId);
    // The cookie changed, so every server component's data is now stale.
    router.refresh();
    setPending(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        className="border-border bg-surface flex items-center gap-[9px] rounded-[10px] border px-3 py-[7px] text-[0.88rem] font-semibold disabled:opacity-60"
      >
        <span
          className="size-[9px] shrink-0 rounded-full"
          style={{ background: active.color }}
          aria-hidden="true"
        />
        <span className="max-w-[160px] truncate">{active.name}</span>
        <ChevronDownIcon className="size-3 shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className="border-border bg-surface shadow-card absolute top-[calc(100%+6px)] left-0 z-50 min-w-[220px] rounded-xl border p-1.5"
        >
          {brands.map((brand) => (
            <button
              key={brand.id}
              role="menuitem"
              onClick={() => choose(brand.id)}
              className={cn(
                "hover:bg-surface-2 flex w-full items-center gap-[9px] rounded-lg px-2.5 py-2.5 text-left text-[0.86rem] font-medium",
                brand.id === activeBrandId && "text-accent",
              )}
            >
              <span
                className="size-[9px] shrink-0 rounded-full"
                style={{ background: brand.color }}
                aria-hidden="true"
              />
              <span className="truncate">{brand.name}</span>
            </button>
          ))}

          {canAddBrand && (
            <a
              href="/settings/brands"
              role="menuitem"
              className="text-accent hover:bg-surface-2 flex w-full items-center gap-[9px] rounded-lg px-2.5 py-2.5 text-left text-[0.86rem] font-semibold"
            >
              + Add brand
            </a>
          )}
        </div>
      )}
    </div>
  );
}
