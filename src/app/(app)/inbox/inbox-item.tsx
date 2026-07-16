"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { PlatformIcon } from "@/components/ui/platform-icon";
import type { InboxItem } from "@/lib/db/inbox";
import type { Sentiment } from "@/types";

import { sendReply, updateStatus, type InboxActionState } from "./actions";

const SENTIMENT_BADGE: Record<Sentiment, { label: string; cls: string }> = {
  lead: { label: "LEAD", cls: "bg-accent-soft text-accent" },
  negative: { label: "NEEDS CARE", cls: "bg-danger-soft text-danger" },
  positive: { label: "POSITIVE", cls: "bg-success-soft text-success" },
  neutral: { label: "NEUTRAL", cls: "bg-surface-2 text-text-2" },
};

const AVATAR_TINTS = ["bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-accent"];

/**
 * One inbox row: the message, a sentiment badge, an AI-drafted reply (with its
 * one-line reasoning), a reply box that actually posts back to the platform, and
 * quick status controls. Once replied or archived the row is dimmed in place.
 */
export function InboxItemRow({ item, tintIndex }: { item: InboxItem; tintIndex: number }) {
  const [draft, setDraft] = useState("");
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [replyState, reply] = useActionState<InboxActionState, FormData>(sendReply, {});
  const [statusState, changeStatus] = useActionState<InboxActionState, FormData>(updateStatus, {});

  const badge = SENTIMENT_BADGE[item.sentiment];
  const done = item.status === "replied" || item.status === "archived";

  const suggest = async () => {
    setDrafting(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not draft a reply.");
      setDraft(data.reply);
      setReasoning(data.reasoning);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Could not draft a reply.");
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div
      className={`border-border flex gap-3 border-b py-4 last:border-0 ${done ? "opacity-60" : ""}`}
    >
      <div
        className={`grid size-[38px] flex-none place-items-center rounded-full text-[0.78rem] font-bold text-white ${AVATAR_TINTS[tintIndex % AVATAR_TINTS.length]}`}
      >
        {initials(item.authorName)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <strong className="text-[0.9rem]">{item.authorName}</strong>
          <PlatformIcon platform={item.platform} size={16} />
          <span className={`rounded-full px-2 py-0.5 text-[0.66rem] font-bold ${badge.cls}`}>
            {badge.label}
          </span>
          <time className="text-text-2 text-[0.74rem]">{relativeTime(item.receivedAt)}</time>
          {item.status === "replied" && (
            <span className="text-success text-[0.74rem] font-semibold">· replied</span>
          )}
          {item.status === "archived" && (
            <span className="text-text-2 text-[0.74rem] font-semibold">· archived</span>
          )}
        </div>

        <p className="text-text-1 text-[0.9rem] leading-relaxed">{item.text}</p>

        {!done && (
          <>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={suggest}
                disabled={drafting}
                className="text-accent bg-accent-soft rounded-[8px] px-2.5 py-1.5 text-[0.78rem] font-semibold disabled:opacity-60"
              >
                {drafting ? "Drafting…" : "✦ AI suggest reply"}
              </button>
              <StatusButton
                itemId={item.id}
                status="assigned"
                label="Assign"
                action={changeStatus}
              />
              <StatusButton
                itemId={item.id}
                status="archived"
                label="Archive"
                action={changeStatus}
              />
            </div>

            {aiError && <p className="text-danger mt-1.5 text-[0.76rem]">{aiError}</p>}
            {reasoning && (
              <p className="text-text-2 mt-1.5 text-[0.76rem] italic">Why: {reasoning}</p>
            )}

            <form action={reply} className="mt-2.5 flex gap-2">
              <input type="hidden" name="itemId" value={item.id} />
              <input
                name="message"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Reply as the brand…`}
                className="border-border bg-surface min-w-0 flex-1 rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none"
              />
              <SendButton disabled={!draft.trim()} />
            </form>

            {(replyState.error ?? statusState.error) && (
              <p role="alert" className="text-danger mt-1.5 text-[0.76rem] font-medium">
                {replyState.error ?? statusState.error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="bg-accent text-accent-fg rounded-[10px] px-4 py-2 text-[0.84rem] font-semibold disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

function StatusButton({
  itemId,
  status,
  label,
  action,
}: {
  itemId: string;
  status: InboxItem["status"];
  label: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="status" value={status} />
      <StatusSubmit label={label} />
    </form>
  );
}

function StatusSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-text-2 hover:text-text-1 text-[0.78rem] font-semibold disabled:opacity-50"
    >
      {pending ? "…" : label}
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
