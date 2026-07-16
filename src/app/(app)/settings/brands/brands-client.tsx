"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { Brand } from "@/types";

import { addBrand, editBrand, removeBrand, type BrandState } from "./actions";

/**
 * Brand colour options. Chart tokens, so a brand dot flips with the theme like
 * every other themed surface — never a raw hex.
 */
const COLOR_OPTIONS = [
  { label: "Indigo", value: "var(--chart-1)" },
  { label: "Cyan", value: "var(--chart-2)" },
  { label: "Amber", value: "var(--chart-3)" },
  { label: "Pink", value: "var(--chart-4)" },
];

/**
 * A representative slice of IANA zones for the customer base.
 *
 * Not the full tz database — a 400-entry select is worse UX than a curated
 * dozen, and the brand timezone only needs to be *right*, not exhaustive. The
 * stored value is a real IANA id, so it can be widened later without migration.
 */
const TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Madrid",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Manila",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function BrandRow({
  brand,
  canManage,
  remainingCount,
}: {
  brand: Brand;
  canManage: boolean;
  remainingCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [removeError, setRemoveError] = useState("");

  if (editing) {
    return (
      <form
        action={editBrand}
        onSubmit={() => setEditing(false)}
        className="border-border bg-surface flex flex-wrap items-end gap-2.5 rounded-[14px] border p-4"
      >
        <input type="hidden" name="brandId" value={brand.id} />
        <Labeled label="Name">
          <input
            name="name"
            defaultValue={brand.name}
            required
            className="border-border bg-surface rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none"
          />
        </Labeled>
        <Labeled label="Timezone">
          <select
            name="timezone"
            defaultValue={brand.timezone}
            className="border-border bg-surface rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("_", " ")}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Colour">
          <select
            name="color"
            defaultValue={brand.color}
            className="border-border bg-surface rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none"
          >
            {COLOR_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Labeled>
        <div className="flex gap-2">
          <SaveButton />
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="border-border bg-surface flex flex-wrap items-center gap-3.5 rounded-[14px] border p-4">
      <span
        className="size-[30px] shrink-0 rounded-[9px]"
        style={{ background: brand.color }}
        aria-hidden="true"
      />
      <div className="min-w-[150px] flex-1">
        <strong className="block text-[0.9rem]">{brand.name}</strong>
        <span className="text-text-2 text-[0.78rem]">{brand.timezone.replace("_", " ")}</span>
      </div>

      {canManage && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="px-3.5 py-2" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <form
            action={async (fd) => {
              const res = await removeBrand(fd);
              if (res?.error) setRemoveError(res.error);
            }}
          >
            <input type="hidden" name="brandId" value={brand.id} />
            <input type="hidden" name="remainingCount" value={remainingCount} />
            <RemoveButton />
          </form>
        </div>
      )}

      {removeError && (
        <p role="alert" className="text-danger w-full text-[0.78rem] font-medium">
          {removeError}
        </p>
      )}
    </div>
  );
}

export function AddBrandForm({ workspaceId }: { workspaceId: string }) {
  const [state, formAction] = useActionState<BrandState, FormData>(addBrand, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="border-border text-text-2 hover:border-accent hover:text-accent mt-3 w-full rounded-2xl border-[1.5px] border-dashed py-4 text-[0.86rem] font-semibold transition-colors"
      >
        + Add brand
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface mt-3 flex flex-wrap items-end gap-2.5 rounded-[14px] border p-4"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Labeled label="Brand name">
        <input
          name="name"
          required
          placeholder="Velvet Bloom Café"
          className="border-border bg-surface placeholder:text-text-2 rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none"
        />
      </Labeled>
      <Labeled label="Timezone">
        <select
          name="timezone"
          defaultValue="Europe/London"
          className="border-border bg-surface rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace("_", " ")}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="Colour">
        <select
          name="color"
          defaultValue="var(--chart-2)"
          className="border-border bg-surface rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none"
        >
          {COLOR_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Labeled>
      <div className="flex gap-2">
        <AddButton />
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {state.error && (
        <p role="alert" className="text-danger w-full text-[0.8rem] font-medium">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.78rem] font-semibold">{label}</span>
      {children}
    </label>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add brand"}
    </Button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-text-2 hover:text-danger rounded-[10px] px-3 py-2 text-[0.86rem] font-semibold disabled:opacity-50"
    >
      {pending ? "Removing…" : "Delete"}
    </button>
  );
}
