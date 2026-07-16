"use client";

import { useEffect, useRef, useState } from "react";

import { LogoMark } from "@/components/ui/icons";

/**
 * Ask Signal — the floating AI chat panel. Replicates the preview's `.ask-fab` /
 * `.ask-panel`.
 *
 * Answers stream from /api/ai/ask token-by-token (text/plain stream), so replies
 * type out like the preview. Grounded in the active brand's data; the endpoint
 * refuses to invent numbers, so out-of-data questions get an honest "I don't
 * have that yet".
 */

interface Message {
  role: "user" | "bot";
  text: string;
}

const SUGGESTED = ["Why did reach drop?", "What should I post next?", "Compare my formats"];

export function AskSignal({ brandId, userName }: { brandId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: `Hi ${userName.split(" ")[0]} 👋 Ask me anything about your brand's performance — I'll answer from your synced data and show my reasoning.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  // Keep the transcript scrolled to the latest message.
  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight });
  }, [messages]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(question: string) {
    if (!question.trim() || streaming) return;

    setMessages((m) => [...m, { role: "user", text: question }, { role: "bot", text: "" }]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, question }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Something went wrong.");
        appendToLastBot(setMessages, errText);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        appendToLastBot(setMessages, decoder.decode(value, { stream: true }));
      }
    } catch {
      appendToLastBot(setMessages, "\n\nSorry — I couldn't reach the analyst just now.");
    } finally {
      setStreaming(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask Signal"
        className="bg-accent text-accent-fg fixed right-4 bottom-[88px] z-[80] grid size-12 place-items-center rounded-[18px] md:right-[26px] md:bottom-[26px] md:size-[54px]"
        style={{ boxShadow: "0 6px 20px rgba(79,70,229,.45)" }}
      >
        <SparkGlyph />
      </button>
    );
  }

  return (
    <div className="border-border bg-surface shadow-card fixed right-4 bottom-[88px] z-[90] flex h-[min(540px,calc(100vh-160px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-[20px] border md:right-[26px] md:bottom-[26px]">
      <div className="border-border flex items-center gap-2.5 border-b p-3.5">
        <div className="bg-accent text-accent-fg grid size-[26px] place-items-center rounded-lg">
          <LogoMark className="size-[13px]" />
        </div>
        <div>
          <strong className="text-[0.9rem]">Ask Signal</strong>
          <span className="text-text-2 block text-[0.72rem]">Plain answers from your own data</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="text-text-2 hover:bg-surface-2 ml-auto grid size-[30px] place-items-center rounded-lg"
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

      <div ref={msgsRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-[14px] px-3 py-2.5 text-[0.84rem] leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-accent text-accent-fg self-end rounded-br-[5px]"
                : "bg-surface-2 self-start rounded-bl-[5px]"
            }`}
          >
            {m.text ||
              (streaming && i === messages.length - 1 ? (
                <span className="text-text-2 italic">Reading your data…</span>
              ) : (
                ""
              ))}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
        {SUGGESTED.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            disabled={streaming}
            className="border-accent text-accent hover:bg-accent-soft rounded-full border px-2.5 py-1.5 text-[0.74rem] font-semibold disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="border-border flex gap-2 border-t p-3.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your data…"
          className="border-border bg-surface-2 flex-1 rounded-[11px] border px-3 py-2.5 text-[0.84rem] outline-none"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="bg-accent text-accent-fg rounded-[10px] px-3.5 py-2 text-[0.88rem] font-semibold disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}

/** Append streamed text to the last bot message immutably. */
function appendToLastBot(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  chunk: string,
) {
  setMessages((prev) => {
    const next = [...prev];
    const last = next[next.length - 1];
    if (last && last.role === "bot") next[next.length - 1] = { ...last, text: last.text + chunk };
    return next;
  });
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-[23px]" aria-hidden="true">
      <path d="M12 2l2.1 6.5H21l-5.5 4 2.1 6.5-5.6-4-5.6 4 2.1-6.5-5.5-4h6.9z" />
    </svg>
  );
}
