"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  deleteReportAction,
  refreshReportAction,
  setDigestAction,
  type ReportFormState,
} from "./actions";
import type { ReportDigest } from "@/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The interactive strip on a report card: copy the public link, refresh the
 * snapshot, schedule the weekly digest, delete. Server-rendered card content
 * stays static; only these controls need the client.
 */
export function ReportCardActions({
  reportId,
  publicUrl,
  digest,
}: {
  reportId: string;
  publicUrl: string;
  digest?: ReportDigest;
}) {
  const [copied, setCopied] = useState(false);
  const [showDigest, setShowDigest] = useState(false);
  const [refreshState, refresh] = useActionState<ReportFormState, FormData>(
    refreshReportAction,
    {},
  );
  const [deleteState, remove] = useActionState<ReportFormState, FormData>(deleteReportAction, {});

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const error = refreshState.error ?? deleteState.error;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="border-border text-text-1 hover:bg-surface-2 rounded-[10px] border px-3.5 py-2 text-[0.82rem] font-semibold"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-accent text-accent-fg rounded-[10px] px-3.5 py-2 text-[0.82rem] font-semibold"
        >
          View report
        </a>
        <form action={refresh}>
          <input type="hidden" name="reportId" value={reportId} />
          <PendingButton idle="Refresh" busy="Refreshing…" />
        </form>
        <button
          type="button"
          onClick={() => setShowDigest((s) => !s)}
          className="border-border text-text-1 hover:bg-surface-2 rounded-[10px] border px-3.5 py-2 text-[0.82rem] font-semibold"
        >
          {digest?.enabled ? "Edit digest" : "Schedule digest"}
        </button>
        <form action={remove}>
          <input type="hidden" name="reportId" value={reportId} />
          <PendingButton idle="Delete" busy="Deleting…" danger />
        </form>
      </div>

      {error && (
        <p role="alert" className="text-danger mt-2 text-[0.8rem] font-medium">
          {error}
        </p>
      )}

      {showDigest && (
        <DigestForm reportId={reportId} digest={digest} onDone={() => setShowDigest(false)} />
      )}
    </div>
  );
}

function DigestForm({
  reportId,
  digest,
  onDone,
}: {
  reportId: string;
  digest?: ReportDigest;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ReportFormState, FormData>(async (prev, fd) => {
    const result = await setDigestAction(prev, fd);
    if (!result.error) onDone();
    return result;
  }, {});

  return (
    <form action={action} className="border-border mt-3 rounded-xl border p-3.5">
      <input type="hidden" name="reportId" value={reportId} />
      <p className="mb-2.5 text-[0.82rem] font-semibold">Weekly digest email</p>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <select
          name="weekday"
          defaultValue={digest?.weekday ?? 1}
          className="border-border bg-surface rounded-[9px] border px-2.5 py-1.5 text-[0.82rem]"
        >
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <input
          name="recipientEmail"
          type="email"
          defaultValue={digest?.recipientEmail ?? ""}
          placeholder="client@company.com"
          className="border-border bg-surface min-w-[180px] flex-1 rounded-[9px] border px-2.5 py-1.5 text-[0.82rem] outline-none"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-danger mb-2 text-[0.8rem] font-medium">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          name="enabled"
          value="on"
          className="bg-accent text-accent-fg rounded-[9px] px-3.5 py-1.5 text-[0.82rem] font-semibold"
        >
          Save schedule
        </button>
        {digest?.enabled && (
          <button
            type="submit"
            name="enabled"
            value="off"
            className="border-border text-text-2 hover:bg-surface-2 rounded-[9px] border px-3.5 py-1.5 text-[0.82rem] font-semibold"
          >
            Turn off
          </button>
        )}
      </div>
    </form>
  );
}

function PendingButton({ idle, busy, danger }: { idle: string; busy: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-[10px] border px-3.5 py-2 text-[0.82rem] font-semibold disabled:opacity-50 ${
        danger
          ? "border-border text-danger hover:bg-danger-soft"
          : "border-border text-text-1 hover:bg-surface-2"
      }`}
    >
      {pending ? busy : idle}
    </button>
  );
}
