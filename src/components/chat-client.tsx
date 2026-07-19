"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "@/db/schema";

// A safe, validated view of an AI SDK tool part. We never render raw JSON, ids, or provider
// payloads — only friendly summaries derived from these fields (specs/04).
type ToolPart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
};

type SourceLink = { title?: string; url?: string };

function isToolPart(part: { type: string }): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

function toolName(part: ToolPart): string {
  if (part.type === "dynamic-tool") return part.toolName ?? "tool";
  return part.type.slice("tool-".length);
}

function nameFor(participants: Profile[], id: unknown): string | null {
  return typeof id === "string" ? participants.find((profile) => profile.id === id)?.name ?? null : null;
}

const LABELS: Record<string, string> = {
  record_tasting_note: "Recording tasting note",
  update_palate_profile: "Updating palate profile",
  save_recommendation: "Saving recommendation",
  search_web: "Searching the web",
  search_wine_availability: "Finding where to buy",
};

const LABELS_DONE: Record<string, string> = {
  record_tasting_note: "Recorded tasting note",
  update_palate_profile: "Updated palate profile",
  save_recommendation: "Saved recommendation",
  search_web: "Searched the web",
  search_wine_availability: "Availability results",
};

// Concise, safe summary from the (possibly partial) validated tool input — no ids, no JSON.
function toolDetail(name: string, input: Record<string, unknown> | undefined, participants: Profile[]): string {
  if (!input) return "";
  if (name === "record_tasting_note") {
    const wine = (input.wine as { name?: string } | undefined)?.name;
    return [wine, nameFor(participants, input.taster_profile_id)].filter(Boolean).join(" · ");
  }
  if (name === "update_palate_profile") return nameFor(participants, input.taster_profile_id) ?? "";
  if (name === "save_recommendation") {
    const target = input.for_profile_id === null ? "the table" : nameFor(participants, input.for_profile_id);
    return [input.wine_name as string | undefined, target].filter(Boolean).join(" · ");
  }
  if (name === "search_web" || name === "search_wine_availability") return (input.query as string | undefined) ?? "";
  return "";
}

function sourcesFrom(part: ToolPart): SourceLink[] {
  const raw = part.state === "output-available" ? (part.output?.sources as SourceLink[] | undefined) : undefined;
  return Array.isArray(raw) ? raw.filter((source) => typeof source.url === "string") : [];
}

function ToolActivity({ part, participants }: { part: ToolPart; participants: Profile[] }) {
  const name = toolName(part);
  const status = part.state === "output-error" ? "failed" : part.state === "output-available" ? "completed" : "running";
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
