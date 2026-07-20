"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { loadDemoData } from "./actions";
import type { DemoSeedResult } from "@/lib/demo-seed";

/**
 * "Load demo data" — mock-mode-only, admin-only. Seeds a coherent sample tenant
 * (connections, posts, analytics, inbox, competitors, autolists, a SmartLink, an
 * anomaly and a report) so every screen is testable before a real Meta account
 * is connected. Idempotent: re-running overwrites the same demo docs in place.
 */
export function DemoDataButton({ brandId }: { brandId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<DemoSeedResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      setResult(await loadDemoData(brandId));
    });
  }

  return (
    <div className="border-border bg-surface mb-4 rounded-[14px] border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={pending}>
          {pending ? "Loading demo data…" : "Load demo data"}
        </Button>
        <span className="text-text-2 text-[0.78rem] leading-relaxed">
          Populate this brand with sample connections, posts, analytics, inbox, competitors and a
          report — enough to try every feature without connecting a real account.
        </span>
      </div>

      {pending && (
        <p className="text-text-2 mt-2.5 text-[0.8rem]">
          Seeding accounts, publishing sample posts and running a sync — this can take a few
          seconds.
        </p>
      )}

      {result && !pending && <DemoOutcome result={result} />}
    </div>
  );
}

function DemoOutcome({ result }: { result: DemoSeedResult }) {
  if (!result.ok) {
    return (
      <div
        role="alert"
        className="bg-danger-soft text-danger mt-2.5 rounded-[10px] px-3 py-2.5 text-[0.8rem] font-medium"
      >
        Couldn’t load demo data: {result.error}
      </div>
    );
  }

  const c = result.counts;
  const lines: string[] = [
    `${c.connections > 0 ? c.connections : "existing"} connection${c.connections === 1 ? "" : "s"}`,
    `${c.posts} posts`,
    `${c.metricsDaily} days of insights`,
    `${c.postMetrics} post metrics`,
    `${c.inbox} inbox items`,
    `${c.competitors} competitors`,
    `${c.autolists} autolist`,
    `${c.smartlinkLinks} SmartLink buttons`,
    `${c.anomalies} anomaly`,
    `${c.reports} report`,
    `${c.media} media assets`,
  ];

  return (
    <div className="bg-success-soft text-success mt-2.5 rounded-[10px] px-3 py-2.5 text-[0.8rem]">
      <p className="mb-1 font-semibold">Demo data loaded</p>
      <p className="leading-relaxed opacity-90">Seeded {lines.join(" · ")}.</p>
      <p className="mt-1.5 opacity-80">
        Explore{" "}
        <a href="/dashboard" className="font-semibold underline">
          Dashboard
        </a>
        ,{" "}
        <a href="/analytics" className="font-semibold underline">
          Analytics
        </a>
        ,{" "}
        <a href="/inbox" className="font-semibold underline">
          Inbox
        </a>{" "}
        and{" "}
        <a href="/pulse" className="font-semibold underline">
          Pulse
        </a>{" "}
        — it’s all mock data, safe to re-run.
      </p>
    </div>
  );
}
