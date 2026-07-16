"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { IntentRing } from "@/components/ui/intent-ring";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { WarningIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Platform } from "@/types";

import { submitPost, type ComposeState } from "./actions";

/**
 * Composer modal. Replicates the preview's `.modal` exactly: platform toggles,
 * shared/FB/IG caption variants, media picker, hashtag + best-time chips,
 * predicted score ring, grid-check strip, and the four submit actions.
 *
 * Caption limits are enforced live (IG 2,200 / FB 63,206). AI features (hashtag
 * chips, score ring) call the API but degrade silently when unavailable.
 */

interface MediaOption {
  id: string;
  type: "image" | "video";
  thumbUrl: string;
}

const CAPTION_LIMIT: Record<Platform, number> = { ig: 2200, fb: 63206 };

type VariantTab = "shared" | "fb" | "ig";

export function Composer({
  brandId,
  brandName,
  connectedPlatforms,
  media,
  pillars,
}: {
  brandId: string;
  brandName: string;
  connectedPlatforms: Platform[];
  media: MediaOption[];
  pillars: string[];
}) {
  const router = useRouter();

  // Default the selection to whatever's connected (or both if nothing is yet).
  const initial = connectedPlatforms.length ? connectedPlatforms : (["fb", "ig"] as Platform[]);
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set(initial));

  const [tab, setTab] = useState<VariantTab>("shared");
  const [shared, setShared] = useState("");
  const [fbCaption, setFbCaption] = useState("");
  const [igCaption, setIgCaption] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [pillar, setPillar] = useState<string>(pillars[0] ?? "");
  const [scheduledAt, setScheduledAt] = useState("");

  const [hashtags, setHashtags] = useState<string[]>([]);
  const [score, setScore] = useState<{
    score: number;
    reasoning: string;
    improvement: string;
  } | null>(null);
  const [scoring, setScoring] = useState(false);

  const [state, formAction] = useActionState<ComposeState, FormData>(submitPost, {});
  const formRef = useRef<HTMLFormElement>(null);

  const active = tab === "fb" ? fbCaption : tab === "ig" ? igCaption : shared;
  const setActive = tab === "fb" ? setFbCaption : tab === "ig" ? setIgCaption : setShared;

  // Effective caption per platform: the platform variant if written, else shared.
  const effective = (p: Platform) => {
    const v = p === "fb" ? fbCaption : igCaption;
    return v.trim() ? v : shared;
  };

  // The character limit shown depends on which tab is active.
  const limit =
    tab === "ig" ? CAPTION_LIMIT.ig : tab === "fb" ? CAPTION_LIMIT.fb : CAPTION_LIMIT.ig;
  const over = active.length > limit;

  function mediaFormat(): "image" | "video" | "carousel" | undefined {
    if (selectedMedia.length === 0) return undefined;
    if (selectedMedia.length > 1) return "carousel";
    const asset = media.find((m) => m.id === selectedMedia[0]);
    return asset?.type;
  }

  /**
   * Predicted score — debounced fetch to /api/ai/score whenever the primary
   * caption or media changes. The effect only synchronises with the external
   * scoring service (all setState happens inside the async callback, never
   * synchronously in the effect body — that's the flagged cascading-render
   * pattern). An empty caption is handled inside the callback, not by an early
   * synchronous reset.
   */
  useEffect(() => {
    const primary = platforms.has("ig") ? "ig" : "fb";
    const caption = effective(primary);

    const timer = setTimeout(async () => {
      if (!caption.trim()) {
        setScore(null);
        return;
      }
      setScoring(true);
      try {
        const res = await fetch("/api/ai/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId,
            caption,
            platform: primary,
            hasMedia: selectedMedia.length > 0,
            format: mediaFormat(),
          }),
        });
        setScore(res.ok ? await res.json() : null);
      } catch {
        setScore(null);
      } finally {
        setScoring(false);
      }
    }, 900);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, fbCaption, igCaption, selectedMedia.length, platforms]);

  async function suggestHashtags() {
    const primary = platforms.has("ig") ? "ig" : "fb";
    const idea = effective(primary);
    if (!idea.trim()) return;
    try {
      const res = await fetch("/api/ai/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, idea, platform: primary }),
      });
      if (res.ok) {
        const data = (await res.json()) as { hashtags: string[] };
        setHashtags(data.hashtags);
      }
    } catch {
      // AI unavailable — no chips, no error shouted at the user.
    }
  }

  function togglePlatform(p: Platform) {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function toggleMedia(id: string) {
    setSelectedMedia((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function addHashtag(tag: string) {
    setActive((c) => (c.trim().endsWith(tag) ? c : `${c.trimEnd()}\n${tag}`));
  }

  function buildPayload(intent: "draft" | "schedule" | "publish" | "request_approval") {
    const variants: Record<string, unknown> = {};
    if (platforms.has("fb")) {
      variants.facebook = { caption: effective("fb"), mediaAssetIds: selectedMedia };
    }
    if (platforms.has("ig")) {
      variants.instagram = { caption: effective("ig"), mediaAssetIds: selectedMedia };
    }
    return JSON.stringify({
      brandId,
      platforms: [...platforms],
      variants,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      intent,
      pillar: pillar || undefined,
      predictedScore: score?.score,
      predictedReasoning: score?.reasoning,
    });
  }

  function submit(intent: "draft" | "schedule" | "publish" | "request_approval") {
    const input = formRef.current?.querySelector<HTMLInputElement>('input[name="payload"]');
    if (input) input.value = buildPayload(intent);
    formRef.current?.requestSubmit();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[rgba(10,10,14,.5)] px-4 py-[5vh] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) router.push("/planner");
      }}
    >
      <div
        role="dialog"
        aria-label="New post"
        className="border-border bg-surface shadow-card w-full max-w-[620px] rounded-[20px] border"
      >
        <div className="border-border flex items-center justify-between border-b px-[22px] py-[18px]">
          <h2 className="text-[1.05rem] font-bold">New post · {brandName}</h2>
          <button
            onClick={() => router.push("/planner")}
            aria-label="Close"
            className="text-text-2 hover:bg-surface-2 grid size-9 place-items-center rounded-[10px]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="size-[18px]"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="p-[22px]">
          {/* platform toggles */}
          <div className="mb-4 flex gap-2">
            {(["fb", "ig"] as Platform[]).map((p) => {
              const on = platforms.has(p);
              const connected = connectedPlatforms.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "flex items-center gap-2 rounded-[10px] border-[1.5px] px-3.5 py-2 text-[0.84rem] font-semibold transition-colors",
                    on ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2",
                  )}
                >
                  <PlatformIcon platform={p} size={18} />
                  {p === "fb" ? "Facebook" : "Instagram"}
                  {!connected && (
                    <span className="text-[0.68rem] font-normal opacity-70">(not connected)</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* variant tabs */}
          <div className="bg-surface-2 mb-2.5 flex w-fit gap-0.5 rounded-[10px] p-[3px]">
            {(
              [
                ["shared", "Shared caption"],
                ["fb", "FB variant"],
                ["ig", "IG variant"],
              ] as [VariantTab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-[0.8rem] font-semibold",
                  tab === key ? "bg-surface text-text-1 shadow-sm" : "text-text-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            value={active}
            onChange={(e) => setActive(e.target.value)}
            placeholder={
              tab === "shared"
                ? "Write your caption. Leave the FB/IG variants blank to use this everywhere."
                : `Override the ${tab === "fb" ? "Facebook" : "Instagram"} caption`
            }
            className="border-border bg-surface min-h-[110px] w-full resize-y rounded-xl border p-[13px] text-[0.9rem] leading-relaxed outline-none"
          />
          <div
            className={cn("mt-1.5 text-right text-[0.72rem]", over ? "text-danger" : "text-text-2")}
          >
            {active.length.toLocaleString()} / {limit.toLocaleString()}
          </div>

          {/* hashtag suggestions */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              onClick={suggestHashtags}
              className="bg-accent-soft text-accent rounded-lg px-2.5 py-1 text-[0.74rem] font-semibold"
            >
              ✦ Suggest hashtags
            </button>
            {hashtags.map((tag) => (
              <button
                key={tag}
                onClick={() => addHashtag(tag)}
                className="bg-accent-soft text-accent rounded-lg px-2.5 py-1 text-[0.74rem] font-semibold transition-transform hover:scale-105"
              >
                {tag}
              </button>
            ))}
          </div>

          {/* media picker */}
          <span className="mt-[18px] mb-2 block text-[0.78rem] font-semibold">Media</span>
          {media.length === 0 ? (
            <p className="text-text-2 text-[0.82rem]">
              No media yet.{" "}
              <a href="/media" className="text-accent font-semibold hover:underline">
                Upload some
              </a>{" "}
              to attach it.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {media.map((m) => {
                const idx = selectedMedia.indexOf(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMedia(m.id)}
                    className={cn(
                      "relative size-[68px] overflow-hidden rounded-xl border-2",
                      idx >= 0 ? "border-accent" : "border-transparent",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.thumbUrl} alt="" className="size-full object-cover" />
                    {idx >= 0 && (
                      <span className="bg-accent text-accent-fg absolute top-1 right-1 grid size-4 place-items-center rounded-full text-[0.6rem] font-bold">
                        {idx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {platforms.has("ig") && selectedMedia.length === 0 && (
            <div className="bg-warning-soft text-warning mt-2.5 flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-[0.78rem] leading-relaxed font-medium">
              <WarningIcon className="mt-px size-3.5 shrink-0" />
              Instagram posts need at least one image or video.
            </div>
          )}

          {/* pillar + schedule */}
          <div className="mt-[18px] flex flex-wrap gap-3">
            {pillars.length > 0 && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.78rem] font-semibold">Pillar</span>
                <select
                  value={pillar}
                  onChange={(e) => setPillar(e.target.value)}
                  className="border-border bg-surface rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none"
                >
                  {pillars.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-[0.78rem] font-semibold">Schedule for</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="border-border bg-surface rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none"
              />
            </label>
          </div>

          {/* predicted score */}
          {(score || scoring) && (
            <div className="bg-surface-2 mt-[18px] flex items-center gap-4 rounded-[14px] p-4">
              {score ? (
                <IntentRing score={score.score} size={64} />
              ) : (
                <div className="text-text-2 grid size-16 place-items-center text-[0.72rem]">…</div>
              )}
              <div className="text-text-2 text-[0.82rem] leading-relaxed">
                {score ? (
                  <>
                    <strong className="text-text-1 mb-0.5 block text-[0.85rem]">
                      Predicted intent:{" "}
                      {score.score >= 75 ? "strong" : score.score >= 50 ? "solid" : "needs work"}
                    </strong>
                    {score.reasoning} <span className="text-text-1">{score.improvement}</span>
                  </>
                ) : (
                  "Scoring your draft…"
                )}
              </div>
            </div>
          )}

          {state.error && (
            <p role="alert" className="text-danger mt-3 text-[0.8rem] font-medium">
              {state.error}
            </p>
          )}
        </div>

        <form ref={formRef} action={formAction} className="hidden">
          <input type="hidden" name="payload" />
        </form>

        <div className="border-border flex flex-wrap justify-end gap-2.5 border-t px-[22px] py-4">
          <Button variant="ghost" onClick={() => submit("draft")} disabled={over}>
            Save draft
          </Button>
          <Button variant="ghost" onClick={() => submit("request_approval")} disabled={over}>
            Request approval
          </Button>
          <Button variant="ghost" onClick={() => submit("publish")} disabled={over}>
            Publish now
          </Button>
          <Button onClick={() => submit("schedule")} disabled={over || !scheduledAt}>
            Schedule
          </Button>
        </div>
      </div>
    </div>
  );
}
