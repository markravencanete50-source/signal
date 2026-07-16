import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import type { ConnectionStatus, PostStatus } from "@/types";

/**
 * Chip — replicates `.chip` and its variants from the preview.
 *
 * The status→variant maps live here rather than at call sites so a status badge
 * looks identical everywhere it appears (dashboard queue, planner, approvals).
 */

export type ChipVariant = "sched" | "pub" | "pend" | "fail" | "draft";

const VARIANTS: Record<ChipVariant, string> = {
  sched: "bg-accent-soft text-accent",
  pub: "bg-success-soft text-success",
  pend: "bg-warning-soft text-warning",
  fail: "bg-danger-soft text-danger",
  draft: "bg-surface-2 text-text-2",
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
}

export function Chip({ variant = "draft", className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export const POST_STATUS_CHIP: Record<PostStatus, { variant: ChipVariant; label: string }> = {
  draft: { variant: "draft", label: "Draft" },
  pending_approval: { variant: "pend", label: "Awaiting approval" },
  approved: { variant: "sched", label: "Approved" },
  scheduled: { variant: "sched", label: "Scheduled" },
  publishing: { variant: "sched", label: "Publishing" },
  published: { variant: "pub", label: "Published" },
  failed: { variant: "fail", label: "Failed" },
};

export const CONNECTION_STATUS_CHIP: Record<
  ConnectionStatus,
  { variant: ChipVariant; label: string }
> = {
  active: { variant: "pub", label: "Connected" },
  expired: { variant: "pend", label: "Expired" },
  error: { variant: "fail", label: "Error" },
};
