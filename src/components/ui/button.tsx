import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Button — replicates `.btn`, `.btn-primary`, `.btn-ghost` from the preview.
 *
 * Preview reference:
 *   .btn         padding:9px 16px; border-radius:10px; font-size:.88rem; weight:600
 *   .btn:active  transform:scale(.97)
 *   .btn-primary background:var(--accent); color:var(--accent-fg); hover:opacity .92
 *   .btn-ghost   border:1px solid var(--border); background:var(--surface)
 */

type Variant = "primary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-[.92]",
  ghost: "border border-border bg-surface text-text-1 hover:bg-surface-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold",
        "transition-[transform,opacity] duration-[120ms] active:scale-[.97]",
        // Disabled state isn't in the preview, but every async action here needs
        // one — without it a double-click double-submits.
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
