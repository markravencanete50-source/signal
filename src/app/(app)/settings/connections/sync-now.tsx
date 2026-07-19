"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { PLATFORM_LABEL } from "@/types";

import { runSyncNow, type SyncNowResult } from "./actions";

/**
 * Admin-only "Run sync now" — the in-app way to trigger a capture and see the
 * result, instead of waiting for the hourly cron (or digging through the GitHub
 * Actions tab). Reports per-connection success/failure so a broken token or a
 * Meta-side error is visible immediately rather than as silent missing data.
 */
export function SyncNowButton({ brandId }: { brandId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncNowResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      setResult(await runSyncNow(brandId));
    });
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={pending}>
          {pending ? "Syncing…" : "Run sync now"}
        </Button>
        <span className="text-text-2 text-[0.78rem] leading-relaxed">
          Pull the latest reach, engagement and post metrics from connected accounts. Normally runs
          hourly.
        </span>
      </div>

      {pending && (
        <p className="text-text-2 mt-2.5 text-[0.8rem]">
          Contacting Meta and writing metrics — this can take a few seconds.
        </p>
      )}

      {result && !pending && <SyncOutcome result={result} />}
    </div>
  );
}

function SyncOutcome({ result }: { result: SyncNowResult }) {
  if (!result.ok) {
    return (
      <div
        role="alert"
        className="bg-danger-soft text-danger mt-2.5 rounded-[10px] px-3 py-2.5 text-[0.8rem] font-medium"
      >
        Sync couldn’t run: {result.error}
      </div>
    );
  }

  if (result.connections.length === 0) {
    return (
      <div className="bg-surface-2 text-text-2 mt-2.5 rounded-[10px] px-3 py-2.5 text-[0.8rem]">
        No connected accounts to sync yet. Connect a Facebook Page or Instagram account below.
      </div>
    );
  }

  const allOk = result.connections.every((c) => c.ok);
  // Reached Facebook fine, but it returned nothing to store — the real state
  // behind an empty Analytics page, and worth explaining rather than hiding.
  const syncedButEmpty = result.connections.some(
    (c) => c.ok && (c.daily ?? 0) === 0 && (c.posts ?? 0) === 0,
  );
  const gotData = result.connections.some(
    (c) => c.ok && ((c.daily ?? 0) > 0 || (c.posts ?? 0) > 0),
  );

  return (
    <div
      className={`mt-2.5 rounded-[10px] px-3 py-2.5 text-[0.8rem] ${
        allOk ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
      }`}
    >
      <p className="mb-1 font-semibold">
        {allOk ? "Sync complete" : "Sync finished with issues"} · {timeAgo(result.at)}
      </p>
      <ul className="space-y-0.5">
        {result.connections.map((c, i) => (
          <li key={`${c.platform}_${i}`} className="leading-relaxed">
            {c.ok ? "✓" : "✗"} {PLATFORM_LABEL[c.platform]} · {c.accountName}
            {c.ok
              ? ` — ${c.daily ?? 0} days of insights, ${c.posts ?? 0} post metrics`
              : ` — ${c.error ?? "failed"}`}
          </li>
        ))}
      </ul>
      {syncedButEmpty && (
        <p className="mt-1.5 opacity-90">
          Connected fine, but Facebook returned no data to store. Two common reasons: a Page reports
          Page-level insights only after it passes Facebook’s follower threshold (≈100 follows), and
          Signal measures per-post metrics only for posts <strong>published through Signal</strong>{" "}
          — a post made directly on Facebook won’t show here.
        </p>
      )}
      {gotData && (
        <p className="mt-1.5 opacity-80">
          New numbers show on{" "}
          <a href="/analytics" className="font-semibold underline">
            Analytics
          </a>{" "}
          and{" "}
          <a href="/pulse" className="font-semibold underline">
            Pulse
          </a>
          .
        </p>
      )}
    </div>
  );
}

/** Compact "just now / 2m ago" for the last run. */
function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
