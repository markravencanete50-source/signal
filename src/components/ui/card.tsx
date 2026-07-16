import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Card — replicates `.card` from the preview:
 *   background:var(--surface); border:1px solid var(--border);
 *   border-radius:16px; padding:20px
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border-border bg-surface rounded-2xl border p-5", className)} {...props} />
  );
}

/** `.card h3` — font-size:.95rem; weight:600; margin-bottom:12px */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("mb-3 text-[0.95rem] font-semibold", className)} {...props} />;
}
