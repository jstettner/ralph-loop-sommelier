"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "@/db/schema";
import { NeuralTrace, traceLinesFromParts } from "@/components/neural-trace";
import { isToolPart, LABELS, LABELS_DONE, sourcesFrom, toolDetail, toolName, toolStatus, type ToolPart } from "@/lib/tool-summary";

function ToolActivity({ part, participants }: { part: ToolPart; participants: Profile[] }) {
  const name = toolName(part);
  const status = toolStatus(part);
  const label = (status === "completed" ? LABELS_DONE[name] : LABELS[name]) ?? name.replaceAll("_", " ");
  const detail = toolDetail(name, part.input, participants);
  const sources = sourcesFrom(part);
  const glyph = status === "completed" ? "✓" : status === "failed" ? "✗" : "▸";
  const color = status === "failed" ? "var(--magenta)" : status === "completed" ? "var(--green)" : "var(--text-dim)";
  return (
    <div className="text-xs tracking-[0.08em]" data-testid="tool-activity" data-tool-state={status}>
      <p style={{ color }}>
        <span className={status === "running" ? "cursor-block" : undefined}>{glyph}</span> {label}
        {detail ? ` — ${detail}` : ""}
        {status === "failed" && part.errorText ? `: ${part.errorText}` : ""}
      </p>
      {sources.length > 0 && (
        <ul className="mt-1 space-y-1" data-testid="tool-sources">
          {sources.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              ↳ <a data-testid="source-link" href={source.url} target="_blank" rel="noreferrer noopener">{source.title || source.url}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChatClient({ conversationId, initialMessages, participants, model, starter }: {
  conversationId: string; initialMessages: UIMessage[]; participants: Profile[]; model: string; starter?: string;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", body: { conversationId } }), [conversationId]);
  const { messages, sendMessage, status, error } = useChat({ id: conversationId, messages: initialMessages, transport });
  const [input, setInput] = useState(starter ?? "");
  const transcript = useRef<HTMLDivElement>(null);
  const starterSent = useRef(false);
  const busy = status === "streaming" || status === "submitted";

  // ── NEURAL TRACE overlay (specs/04, specs/10) ──
  // Chat is driven by provider-visible reasoning: the overlay opens on the first reasoning delta
  // and dissolves once the final answer text begins. A no-reasoning turn never opens it.
  const active = busy ? messages[messages.length - 1] : undefined;
  const assistant = active && active.role === "assistant" ? active : undefined;
  const reasoningPresent = assistant?.parts.some((part) => part.type === "reasoning") ?? false;
  const lastPart = assistant?.parts[assistant.parts.length - 1];
  const finalTextBegan = lastPart?.type === "text" && ((lastPart as { text?: string }).text?.trim().length ?? 0) > 0;
  const traceOpen = reasoningPresent && !finalTextBegan;
  const traceLines = assistant ? traceLinesFromParts(assistant.parts, participants) : [];
  const traceKey = traceLines.join("\n");
  const linesRef = useRef<string[]>([]);
  linesRef.current = traceLines;
  const [tracePhase, setTracePhase] = useState<"hidden" | "open" | "dissolving">("hidden");
  const [traceRendered, setTraceRendered] = useState<string[]>([]);

  useEffect(() => { if (traceOpen) setTraceRendered(linesRef.current); }, [traceOpen, traceKey]);
  useEffect(() => {
    if (traceOpen) { setTracePhase("open"); return; }
    setTracePhase((prev) => (prev === "open" ? "dissolving" : prev));
  }, [traceOpen]);
  useEffect(() => {
    if (tracePhase !== "dissolving") return;
    const timer = setTimeout(() => setTracePhase("hidden"), 800);
    return () => clearTimeout(timer);
  }, [tracePhase]);

  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: "smooth" }); }, [messages, status]);
  useEffect(() => {
    if (starter && initialMessages.length === 0 && !starterSent.current) {
      starterSent.current = true;
      setInput("");
      void sendMessage({ text: starter });
    }
  }, [initialMessages.length, sendMessage, starter]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
  }
  return <div className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] flex-col md:h-[calc(100dvh-4rem)]">
    {tracePhase !== "hidden" && <NeuralTrace lines={traceRendered} dissolving={tracePhase === "dissolving"} />}
    <header className="border-b border-[var(--border)] pb-4">
      <p className="text-[11px] tracking-[0.18em] text-[var(--text-dim)]">PARTICIPANTS</p>
      <div className="mt-2 flex flex-wrap gap-3">{participants.map((profile) => <span key={profile.id} className={`text-xs tracking-[0.1em] bloom-${profile.color}`} style={{ color: `var(--${profile.color})` }}>{profile.name}</span>)}</div>
      <p className="mt-2 text-[11px] tracking-[0.18em] text-[var(--text-dim)]">MODEL: {model}</p>
    </header>
    <div ref={transcript} className="min-h-0 flex-1 space-y-7 overflow-y-auto py-6" aria-live="polite" data-testid="chat-transcript">
      {messages.length === 0 && <p className="text-[var(--text-dim)]">Tell me what&apos;s in your glass, ask a wine question, or start with what you want to learn.</p>}
      {messages.map((message) => <article key={message.id} data-role={message.role}>
        <p className={message.role === "user" ? "text-[var(--cyan)]" : "text-[var(--text-dim)]"}>{message.role === "user" ? ">" : "somm@cellar:~$"}</p>
        <div className="mt-2 space-y-2 leading-7">{message.parts.map((part, index) => {
          if (part.type === "text") return <p className="whitespace-pre-wrap" key={index}>{part.text}</p>;
          // Reasoning summaries never enter the permanent transcript — they drive the transient
          // NEURAL TRACE overlay while streaming (specs/04, specs/10).
          if (part.type === "reasoning") return null;
          if (isToolPart(part)) return <ToolActivity key={(part as ToolPart).toolCallId ?? index} part={part as ToolPart} participants={participants} />;
          return null;
        })}</div>
      </article>)}
      {busy && <p className="cursor-block text-[var(--cyan)]">▮</p>}
      {error && <p className="text-[var(--magenta)]" role="alert">{error.message}</p>}
    </div>
    <form className="sticky bottom-0 flex gap-3 border-t border-[var(--border)] bg-[var(--bg)] py-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={submit}>
      <label className="sr-only" htmlFor="chat-message">Message</label>
      <textarea id="chat-message" className="terminal-input min-h-14 resize-none !text-base" value={input} onChange={(event) => setInput(event.target.value)} />
      <button className="terminal-button terminal-button--primary min-w-16" type="submit" aria-label="Send message" disabled={busy}>SEND</button>
    </form>
  </div>;
}
