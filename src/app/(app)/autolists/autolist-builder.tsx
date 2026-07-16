"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { AutolistType, Platform } from "@/types";

import { createAutolistAction, type AutolistState } from "./actions";

/**
 * "New autolist" — expands in place. Evergreen mode captures a queue of captions
 * + a retire threshold; RSS mode captures a feed URL. Platforms and cadence apply
 * to both. Submits the whole thing as one JSON payload.
 */
export function AutolistBuilder({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AutolistType>("evergreen");
  const [platforms, setPlatforms] = useState<Platform[]>(["fb"]);
  const [captions, setCaptions] = useState<string[]>([""]);
  const [state, action] = useActionState<AutolistState, FormData>(createAutolistAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-accent text-accent-fg rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold"
      >
        + New autolist
      </button>
    );
  }

  const togglePlatform = (p: Platform) =>
    setPlatforms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));

  return (
    <form
      action={(fd) => {
        const items = captions
          .map((c) => c.trim())
          .filter(Boolean)
          .map((caption) => ({ caption, mediaAssetIds: [] }));
        fd.set(
          "payload",
          JSON.stringify({
            brandId,
            name: String(fd.get("name") ?? ""),
            type,
            platforms,
            cadenceDays: Number(fd.get("cadenceDays") ?? 3),
            retireBelowIntent:
              type === "evergreen" && fd.get("retire") ? Number(fd.get("retire")) : null,
            items,
            rssUrl: type === "rss" ? String(fd.get("rssUrl") ?? "") : "",
          }),
        );
        return action(fd);
      }}
      className="border-border bg-surface rounded-2xl border p-5"
    >
      <h3 className="mb-3 text-[0.95rem] font-semibold">New autolist</h3>

      <div className="mb-4 flex gap-2">
        {(["evergreen", "rss"] as AutolistType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-[10px] border-[1.5px] px-3.5 py-1.5 text-[0.82rem] font-semibold capitalize transition-colors ${
              type === t ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2"
            }`}
          >
            {t === "rss" ? "RSS feed" : "Evergreen"}
          </button>
        ))}
      </div>

      <Row label="Name">
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Evergreen landlord tips"
          className={input}
        />
      </Row>

      <Row label="Platforms">
        <div className="flex gap-2">
          {(["fb", "ig"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[0.82rem] font-semibold uppercase transition-colors ${
                platforms.includes(p)
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-2"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </Row>

      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Repeat every (days)">
          <input
            name="cadenceDays"
            type="number"
            min={1}
            max={90}
            defaultValue={3}
            className={input}
          />
        </Row>
        {type === "evergreen" && (
          <Row label="Auto-retire below intent (blank = off)">
            <input
              name="retire"
              type="number"
              min={0}
              max={100}
              placeholder="45"
              className={input}
            />
          </Row>
        )}
      </div>

      {type === "rss" ? (
        <Row label="Feed URL">
          <input
            name="rssUrl"
            type="url"
            placeholder="https://example.com/blog/feed"
            className={input}
          />
        </Row>
      ) : (
        <div className="mt-2">
          <label className="text-text-2 mb-1.5 block text-[0.76rem] font-semibold">
            Evergreen posts
          </label>
          {platforms.includes("ig") && (
            <p className="text-text-2 mb-2 text-[0.74rem]">
              Instagram needs media — add images to these in the Composer, or keep this queue to
              Facebook.
            </p>
          )}
          <div className="space-y-2">
            {captions.map((c, i) => (
              <div key={i} className="flex gap-2">
                <textarea
                  value={c}
                  onChange={(e) =>
                    setCaptions((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  rows={2}
                  maxLength={2200}
                  placeholder={`Post ${i + 1}`}
                  className={`${input} resize-y`}
                />
                {captions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCaptions((cs) => cs.filter((_, j) => j !== i))}
                    className="text-text-2 hover:text-danger text-[0.74rem] font-semibold"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCaptions((cs) => [...cs, ""])}
            className="border-border text-text-2 hover:border-accent hover:text-accent mt-2 w-full rounded-[10px] border-[1.5px] border-dashed py-2 text-[0.8rem] font-semibold"
          >
            + Add post
          </button>
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-danger mt-3 text-[0.82rem] font-medium">
          {state.error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Submit />
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

const input =
  "border-border bg-surface w-full rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="text-text-2 mb-1.5 block text-[0.76rem] font-semibold">{label}</label>
      {children}
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-accent-fg rounded-[10px] px-4 py-2 text-[0.86rem] font-semibold disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create autolist"}
    </button>
  );
}
