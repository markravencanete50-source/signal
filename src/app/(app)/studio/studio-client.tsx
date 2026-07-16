"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IntentRing } from "@/components/ui/intent-ring";
import { SparkIcon } from "@/components/ui/icons";

import { generateWeekPlan } from "./actions";

interface Suggestion {
  format: string;
  platforms: string;
  title: string;
  signal: string;
  why: string;
  action: string;
  predictedScore: number;
  kind: "create" | "retire";
}

/**
 * Suggestions grid — fetches grounded ideas from /api/ai/suggest on mount, so
 * Studio paints instantly and the (slow, billable) AI call only happens when the
 * view is actually open. Each "Draft it" carries the idea into the Composer via
 * query params.
 */
export function Suggestions({ brandId }: { brandId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/ai/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId }),
        });

        if (cancelled) return;

        if (res.status === 503) {
          setMessage("Add an Anthropic API key to get grounded content suggestions.");
          setState("empty");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }

        const data = (await res.json()) as { suggestions?: Suggestion[]; reason?: string };
        if (!data.suggestions || data.suggestions.length === 0) {
          setMessage(
            data.reason === "no_data"
              ? "Suggestions appear once your posts have synced some performance data — publish a few and check back."
              : "No suggestions right now.",
          );
          setState("empty");
          return;
        }

        setSuggestions(data.suggestions);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [brandId]);

  if (state === "loading") {
    return (
      <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="min-h-[200px] animate-pulse">
            <div className="bg-surface-2 mb-2.5 h-4 w-24 rounded" />
            <div className="bg-surface-2 mb-2 h-5 w-full rounded" />
            <div className="bg-surface-2 h-16 w-full rounded" />
          </Card>
        ))}
      </div>
    );
  }

  if (state === "empty" || state === "error") {
    return (
      <Card className="mt-3.5">
        <p className="text-text-2 text-[0.85rem]">
          {state === "error" ? "Couldn't load suggestions. Try refreshing." : message}
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {suggestions.map((s, i) => (
        <SuggestionCard key={i} suggestion={s} brandId={brandId} />
      ))}
    </div>
  );
}

function SuggestionCard({ suggestion: s, brandId }: { suggestion: Suggestion; brandId: string }) {
  const isRetire = s.kind === "retire";

  // "Draft it" carries the idea into the Composer as a prefilled caption.
  const draftHref = `/planner/compose?brand=${brandId}&caption=${encodeURIComponent(`${s.title}\n\n${s.action}`)}`;

  return (
    <Card className="flex flex-col">
      <span
        className={`mb-2.5 inline-block w-fit rounded-[7px] px-2 py-0.5 text-[0.66rem] font-bold tracking-[0.05em] uppercase ${
          isRetire ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent"
        }`}
      >
        {s.format}
      </span>
      <h3 className="mb-2 text-[0.95rem] leading-snug font-semibold">{s.title}</h3>

      {/* The reasoning chain: signal → why → action. Never a bare suggestion. */}
      <div className="border-accent text-text-2 mb-3.5 border-l-[3px] pl-3 text-[0.8rem] leading-relaxed">
        <p>
          <b className="text-text-1">Signal:</b> {s.signal}
        </p>
        <p className="mt-1.5">
          <b className="text-text-1">Why:</b> {s.why}
        </p>
      </div>

      <div className="mt-auto flex items-center gap-3">
        <IntentRing score={s.predictedScore} />
        {isRetire ? (
          <span className="text-text-2 ml-auto text-[0.8rem] font-medium">{s.action}</span>
        ) : (
          <Link
            href={draftHref}
            className="bg-accent text-accent-fg ml-auto inline-flex items-center rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold"
          >
            Draft it
          </Link>
        )}
      </div>
    </Card>
  );
}

/** "Generate this week's plan" — creates 5 best-time drafts via the action. */
export function GenerateWeekButton({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function run() {
    setBusy(true);
    setNote("");
    const fd = new FormData();
    fd.set("brandId", brandId);
    const res = await generateWeekPlan(fd);
    setBusy(false);

    if (res.error) {
      setNote(res.error);
    } else {
      setNote(`${res.created} drafts added to your Planner.`);
      router.push("/planner");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={run} disabled={busy}>
        <SparkIcon className="size-[15px]" />
        {busy ? "Planning…" : "Generate this week's plan"}
      </Button>
      {note && <span className="text-text-2 text-[0.76rem]">{note}</span>}
    </div>
  );
}
