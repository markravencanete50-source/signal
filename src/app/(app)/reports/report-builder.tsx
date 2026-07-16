"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { PlusIcon } from "@/components/ui/icons";
import type { Brand, ReportPeriod } from "@/types";

import { createReportAction, type ReportFormState } from "./actions";

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "last-7-days", label: "Last 7 days" },
  { value: "last-30-days", label: "Last 30 days" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
];

/**
 * "New report" — a tile that expands into the builder in place. Picks a period
 * and one-or-more brands; on submit the server snapshots the metrics and
 * generates the narrative, then the list revalidates.
 */
export function ReportBuilder({ brands }: { brands: Brand[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ReportFormState, FormData>(createReportAction, {});
  const [selected, setSelected] = useState<string[]>(brands[0] ? [brands[0].id] : []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border text-text-2 hover:border-accent hover:text-accent flex min-h-[180px] w-full items-center justify-center rounded-2xl border-[1.5px] border-dashed text-[0.86rem] font-semibold transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          <PlusIcon className="size-[18px]" />
          New report
        </span>
      </button>
    );
  }

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <form
      action={(fd) => {
        selected.forEach((id) => fd.append("brandIds", id));
        return action(fd);
      }}
      className="border-border bg-surface rounded-2xl border p-5"
    >
      <h3 className="mb-3 text-[0.95rem] font-semibold">New report</h3>

      <label className="text-text-2 mb-1.5 block text-[0.78rem] font-semibold">Title</label>
      <input
        name="title"
        required
        maxLength={120}
        placeholder="June 2026 — Monthly"
        className="border-border bg-surface mb-3.5 w-full rounded-[10px] border px-3 py-2 text-[0.88rem] outline-none"
      />

      <label className="text-text-2 mb-1.5 block text-[0.78rem] font-semibold">Period</label>
      <select
        name="period"
        defaultValue="last-30-days"
        className="border-border bg-surface mb-3.5 w-full rounded-[10px] border px-3 py-2 text-[0.88rem] outline-none"
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <label className="text-text-2 mb-1.5 block text-[0.78rem] font-semibold">Brands</label>
      <div className="mb-4 flex flex-wrap gap-2">
        {brands.map((b) => {
          const on = selected.includes(b.id);
          return (
            <button
              type="button"
              key={b.id}
              onClick={() => toggle(b.id)}
              className={`rounded-[10px] border-[1.5px] px-3 py-1.5 text-[0.82rem] font-semibold transition-colors ${
                on ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2"
              }`}
            >
              {b.name}
            </button>
          );
        })}
      </div>

      {state.error && (
        <p role="alert" className="text-danger mb-3 text-[0.82rem] font-medium">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Submit disabled={selected.length === 0} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="border-border text-text-2 hover:bg-surface-2 rounded-[10px] border px-4 py-2 text-[0.86rem] font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="bg-accent text-accent-fg rounded-[10px] px-4 py-2 text-[0.86rem] font-semibold disabled:opacity-50"
    >
      {pending ? "Generating…" : "Create report"}
    </button>
  );
}
