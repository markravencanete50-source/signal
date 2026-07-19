"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import type { Platform } from "@/types";

/**
 * The Composer's fourth variant tab — "AI suggestion".
 *
 * Two tools in one panel:
 *  - Suggest: the writer types what they want to post; we return at least 3
 *    distinct caption options, each with its angle.
 *  - Paraphrase: the writer pastes a line; we return at least 3 rewrites, each
 *    with a note on what changed.
 *
 * Both ship the AI's reasoning next to every option (the build rule "never a bare
 * suggestion"), and "Use this" drops the chosen text into the shared caption.
 * Every result view has loading, empty and error states.
 */

type Mode = "suggest" | "paraphrase";

interface SuggestItem {
  caption: string;
  angle: string;
}
interface ParaphraseItem {
  text: string;
  note: string;
}

export function AiSuggestionPanel({
  brandId,
  platform,
  onUse,
}: {
  brandId: string;
  /** Primary platform to tune output for (the score/hashtag surfaces use the same pick). */
  platform: Platform;
  /** Apply the chosen text to the shared caption and jump the writer back to it. */
  onUse: (text: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("suggest");

  const [idea, setIdea] = useState("");
  const [phrase, setPhrase] = useState("");

  const [suggestions, setSuggestions] = useState<SuggestItem[] | null>(null);
  const [variants, setVariants] = useState<ParaphraseItem[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = mode === "suggest" ? idea : phrase;

  async function run() {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        mode === "suggest" ? "/api/ai/content-suggest" : "/api/ai/paraphrase",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "suggest" ? { brandId, idea, platform } : { brandId, text: phrase, platform },
          ),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          res.status === 503
            ? "AI suggestions aren’t configured yet."
            : (data?.error ?? "Couldn’t generate anything. Try again."),
        );
        return;
      }
      const data = await res.json();
      if (mode === "suggest") {
        setSuggestions(data.suggestions ?? []);
      } else {
        setVariants(data.variants ?? []);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
  }

  const results = mode === "suggest" ? suggestions : variants;
  const hasResults = results !== null;

  return (
    <div className="border-border bg-surface min-h-[110px] rounded-xl border p-[13px]">
      {/* sub-tool toggle */}
      <div className="bg-surface-2 mb-3 flex w-fit gap-0.5 rounded-[10px] p-[3px]">
        {(
          [
            ["suggest", "✦ Suggest content"],
            ["paraphrase", "↺ Paraphrase"],
          ] as [Mode, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchMode(key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold transition-colors",
              mode === key ? "bg-surface text-text-1 shadow-sm" : "text-text-2",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "suggest" ? (
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Describe what you want to post — the topic, the goal, any must-haves. We’ll draft at least 3 options."
          className="border-border bg-surface min-h-[76px] w-full resize-y rounded-[10px] border p-[11px] text-[0.88rem] leading-relaxed outline-none"
        />
      ) : (
        <textarea
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="Paste a sentence or caption and we’ll paraphrase it into at least 3 fresh variants."
          className="border-border bg-surface min-h-[76px] w-full resize-y rounded-[10px] border p-[11px] text-[0.88rem] leading-relaxed outline-none"
        />
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={!input.trim() || loading}
          className="bg-accent text-accent-fg rounded-[10px] px-3.5 py-2 text-[0.8rem] font-semibold transition-[transform,opacity] duration-[120ms] active:scale-[.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading
            ? mode === "suggest"
              ? "Drafting…"
              : "Rewriting…"
            : mode === "suggest"
              ? "Suggest 3+ options"
              : "Paraphrase"}
        </button>
        {hasResults && !loading && (
          <button
            type="button"
            onClick={run}
            className="text-text-2 hover:text-text-1 rounded-[10px] px-2 py-2 text-[0.8rem] font-semibold"
          >
            Regenerate
          </button>
        )}
      </div>

      {/* result region */}
      <div className="mt-3">
        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <div className="bg-warning-soft text-warning flex flex-col items-start gap-2 rounded-[10px] px-3 py-3 text-[0.82rem] font-medium">
            <span>{error}</span>
            <button
              type="button"
              onClick={run}
              className="border-warning/40 rounded-lg border px-2.5 py-1 text-[0.76rem] font-semibold"
            >
              Retry
            </button>
          </div>
        ) : mode === "suggest" && suggestions ? (
          suggestions.length === 0 ? (
            <EmptyResult />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {suggestions.map((s, i) => (
                <ResultCard
                  key={i}
                  index={i}
                  body={s.caption}
                  reason={s.angle}
                  reasonLabel="Angle"
                  onUse={() => onUse(s.caption)}
                />
              ))}
            </ul>
          )
        ) : mode === "paraphrase" && variants ? (
          variants.length === 0 ? (
            <EmptyResult />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {variants.map((v, i) => (
                <ResultCard
                  key={i}
                  index={i}
                  body={v.text}
                  reason={v.note}
                  reasonLabel="What changed"
                  onUse={() => onUse(v.text)}
                />
              ))}
            </ul>
          )
        ) : (
          <p className="text-text-2 text-[0.8rem] leading-relaxed">
            {mode === "suggest"
              ? "Tell us the post you have in mind and we’ll come back with at least 3 options — each with the angle it’s going for."
              : "Drop in a line and we’ll offer at least 3 ways to say it."}
          </p>
        )}
      </div>
    </div>
  );
}

/** One suggestion/variant with its reasoning and a "Use this" action. */
function ResultCard({
  index,
  body,
  reason,
  reasonLabel,
  onUse,
}: {
  index: number;
  body: string;
  reason: string;
  reasonLabel: string;
  onUse: () => void;
}) {
  return (
    <li className="border-border bg-surface-2 rounded-[12px] border p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-text-2 text-[0.72rem] font-semibold">Option {index + 1}</span>
        <button
          type="button"
          onClick={onUse}
          className="bg-accent-soft text-accent rounded-lg px-2.5 py-1 text-[0.74rem] font-semibold transition-transform hover:scale-105"
        >
          Use this
        </button>
      </div>
      <p className="text-text-1 text-[0.88rem] leading-relaxed whitespace-pre-wrap">{body}</p>
      <p className="text-text-2 mt-2 text-[0.76rem] leading-relaxed">
        <span className="font-semibold">{reasonLabel}:</span> {reason}
      </p>
    </li>
  );
}

/** Three shimmering placeholder rows while the model works. */
function SkeletonRows() {
  return (
    <ul className="flex flex-col gap-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="border-border bg-surface-2 rounded-[12px] border p-3">
          <div className="bg-border mb-2 h-3 w-16 rounded motion-safe:animate-pulse" />
          <div className="bg-border mb-1.5 h-3 w-full rounded motion-safe:animate-pulse" />
          <div className="bg-border h-3 w-4/5 rounded motion-safe:animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

function EmptyResult() {
  return (
    <p className="text-text-2 text-[0.8rem] leading-relaxed">
      Nothing came back this time — tweak your wording and try again.
    </p>
  );
}
