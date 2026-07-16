"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import type { SmartLink } from "@/types";

import { saveSmartLinkAction, type SmartLinkState } from "./actions";

interface EditableLink {
  id: string;
  label: string;
  url: string;
  hot: boolean;
  clicks: number;
}

/**
 * SmartLink editor — live phone preview beside the fields. Links reorder by
 * drag; each row shows its accumulated clicks. Save posts the whole page as one
 * JSON payload (click counts are preserved server-side by link id).
 */
export function SmartLinkEditor({ initial, publicUrl }: { initial: SmartLink; publicUrl: string }) {
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [avatarText, setAvatarText] = useState(initial.avatarText);
  const [accent, setAccent] = useState(initial.accent);
  const [slug, setSlug] = useState(initial.slug);
  const [links, setLinks] = useState<EditableLink[]>(initial.links);
  const [copied, setCopied] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const [state, action] = useActionState<SmartLinkState, FormData>(saveSmartLinkAction, {});

  const update = (id: string, patch: Partial<EditableLink>) =>
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => setLinks((ls) => ls.filter((l) => l.id !== id));
  const add = () =>
    setLinks((ls) => [
      ...ls,
      { id: crypto.randomUUID(), label: "New link", url: "https://", hot: false, clicks: 0 },
    ]);

  const onDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === to) return;
    setLinks((ls) => {
      const next = [...ls];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const total = links.reduce((s, l) => s + l.clicks, 0);

  const payload = JSON.stringify({
    id: initial.id,
    title,
    subtitle,
    avatarText,
    accent,
    slug,
    links: links.map((l) => ({ id: l.id, label: l.label, url: l.url, hot: l.hot })),
  });

  return (
    <div className="grid items-start gap-[18px] lg:grid-cols-[280px_1fr]">
      {/* Live phone preview */}
      <div className="border-border bg-surface rounded-[32px] border p-3.5 shadow-sm">
        <div className="bg-bg rounded-[22px] px-4 py-6 text-center">
          <div
            className="mx-auto grid size-[56px] place-items-center rounded-full text-[1.1rem] font-bold text-white"
            style={{ background: accent }}
          >
            {avatarText}
          </div>
          <h4 className="mt-2.5 text-[1rem] font-bold tracking-[-0.01em]">{title}</h4>
          {subtitle && <p className="text-text-2 mt-1 text-[0.74rem]">{subtitle}</p>}
          <div className="mt-4 space-y-2">
            {links.map((l) => (
              <div
                key={l.id}
                className="border-border bg-surface rounded-xl border px-3 py-2.5 text-[0.82rem] font-semibold"
                style={
                  l.hot ? { background: accent, borderColor: accent, color: "#fff" } : undefined
                }
              >
                {l.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Editor */}
      <form action={action} className="border-border bg-surface rounded-2xl border p-5">
        <input type="hidden" name="payload" value={payload} />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-text-2 text-[0.78rem]">
            Public link:{" "}
            <span className="text-text-1 font-semibold">
              {publicUrl.replace(/^https?:\/\//, "")}
            </span>
          </div>
          <button
            type="button"
            onClick={copy}
            className="border-border text-text-1 hover:bg-surface-2 rounded-[9px] border px-3 py-1.5 text-[0.8rem] font-semibold"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              className={inputCls}
            />
          </Field>
          <Field label="Link address (slug)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={40}
              className={inputCls}
            />
          </Field>
          <Field label="Avatar initials">
            <input
              value={avatarText}
              onChange={(e) => setAvatarText(e.target.value.slice(0, 2))}
              maxLength={2}
              className={inputCls}
            />
          </Field>
          <Field label="Accent colour">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="border-border h-[38px] w-full rounded-[10px] border"
            />
          </Field>
        </div>

        <Field label="Subtitle">
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={160}
            className={inputCls}
          />
        </Field>

        <div className="mt-5 mb-2 flex items-center justify-between">
          <label className="text-text-2 text-[0.78rem] font-semibold">Links &amp; clicks</label>
          <span className="text-text-2 text-[0.76rem]">{total.toLocaleString()} total clicks</span>
        </div>

        <div className="space-y-2">
          {links.map((link, i) => (
            <div
              key={link.id}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className="border-border bg-surface flex items-center gap-2 rounded-xl border p-2.5"
            >
              <span className="text-text-2 cursor-grab px-1 select-none" aria-hidden>
                ⋮⋮
              </span>
              <div className="flex-1 space-y-1.5">
                <input
                  value={link.label}
                  onChange={(e) => update(link.id, { label: e.target.value })}
                  placeholder="Label"
                  maxLength={60}
                  className={inputCls}
                />
                <input
                  value={link.url}
                  onChange={(e) => update(link.id, { url: e.target.value })}
                  placeholder="https://…"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-text-2 text-[0.72rem]">{link.clicks} clicks</span>
                <button
                  type="button"
                  onClick={() => update(link.id, { hot: !link.hot })}
                  className={`rounded-[8px] border px-2 py-1 text-[0.72rem] font-semibold ${
                    link.hot
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-text-2"
                  }`}
                >
                  {link.hot ? "Featured" : "Feature"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(link.id)}
                  className="text-text-2 hover:text-danger text-[0.72rem] font-semibold"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={add}
          className="border-border text-text-2 hover:border-accent hover:text-accent mt-2.5 w-full rounded-xl border-[1.5px] border-dashed py-2.5 text-[0.82rem] font-semibold"
        >
          + Add link
        </button>

        {state.error && (
          <p role="alert" className="text-danger mt-3 text-[0.82rem] font-medium">
            {state.error}
          </p>
        )}
        {state.ok && <p className="text-success mt-3 text-[0.82rem] font-medium">Saved.</p>}

        <div className="mt-4">
          <SaveButton />
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "border-border bg-surface w-full rounded-[10px] border px-3 py-2 text-[0.86rem] outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-text-2 mb-1 block text-[0.76rem] font-semibold">{label}</label>
      {children}
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-accent-fg rounded-[10px] px-4 py-2 text-[0.86rem] font-semibold disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}
