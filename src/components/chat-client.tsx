"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "@/db/schema";
import { NeuralTrace, traceLinesFromParts } from "@/components/neural-trace";
import { isToolPart, sourcesFrom, toolDetail, toolLabel, toolName, toolStatus, type ToolPart } from "@/lib/tool-summary";

function ToolActivity({ part, participants }: { part: ToolPart; participants: Profile[] }) {
  const name = toolName(part);
  const status = toolStatus(part);
  const label = toolLabel(part);
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

type RunState = { status: "running" | "completed" | "failed" | "interrupted"; safeError: string | null } | null;

export function shouldSubmitChatShortcut(event: Pick<KeyboardEvent<HTMLTextAreaElement>, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "repeat"> & { composing: boolean }) {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && !event.repeat && !event.composing;
}

export function ChatClient({ conversationId, initialMessages, participants, model, title: initialTitle, initialRun, starter }: {
  conversationId: string; initialMessages: UIMessage[]; participants: Profile[]; model: string; title: string; initialRun: RunState; starter?: string;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", body: { conversationId } }), [conversationId]);
  const { messages, setMessages, sendMessage, status, error } = useChat({ id: conversationId, messages: initialMessages, transport });
  const [input, setInput] = useState(starter ?? "");
  const [title, setTitle] = useState(initialTitle);
  const [run, setRun] = useState<RunState>(initialRun);
  const transcript = useRef<HTMLDivElement>(null);
  const starterSent = useRef(false);
  const busy = status === "streaming" || status === "submitted" || run?.status === "running";

  // ── NEURAL TRACE overlay (specs/04, specs/10) ──
  // Chat is driven by provider-visible reasoning: the overlay opens on the first reasoning delta
  // and dissolves once the final answer text begins. A no-reasoning turn never opens it.
  // Keep the latest assistant as the trace owner through its decay. `useChat` can become ready
  // before that timer ends; tying this to `busy` would reveal the final text underneath the fade.
  const latest = messages[messages.length - 1];
  const assistant = latest?.role === "assistant" ? latest : undefined;
  const reasoningPresent = assistant?.parts.some((part) => part.type === "reasoning") ?? false;
  const lastPart = assistant?.parts[assistant.parts.length - 1];
  const finalTextBegan = lastPart?.type === "text" && ((lastPart as { text?: string }).text?.trim().length ?? 0) > 0;
  const finalTextIndex = finalTextBegan && assistant ? assistant.parts.length - 1 : -1;
  const traceOpen = reasoningPresent && !finalTextBegan;
  const traceLines = assistant ? traceLinesFromParts(assistant.parts, participants) : [];
  const traceKey = traceLines.join("\n");
  const transcriptKey = messages.map((message) => `${message.id}:${JSON.stringify(message.parts.filter((part) => part.type !== "reasoning"))}`).join("|");
  const linesRef = useRef<string[]>([]);
  linesRef.current = traceLines;
  const [tracePhase, setTracePhase] = useState<"hidden" | "open" | "dissolving">("hidden");
  const [traceRendered, setTraceRendered] = useState<string[]>([]);

  useEffect(() => { if (reasoningPresent) setTraceRendered(linesRef.current); }, [reasoningPresent, traceKey]);
  useEffect(() => {
    if (traceOpen) { setTracePhase("open"); return; }
    setTracePhase((prev) => (prev === "open" ? "dissolving" : prev));
  }, [traceOpen]);
  useEffect(() => {
    if (tracePhase !== "dissolving") return;
    const timer = setTimeout(() => setTracePhase("hidden"), 800);
    return () => clearTimeout(timer);
  }, [tracePhase]);

  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: "auto" }); }, [transcriptKey]);
  useEffect(() => {
    if (run?.status !== "running") return;
    let stopped = false;
    const refresh = async () => {
      const response = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
      const payload = await response.json() as { messages?: Array<{ id: string; role: "user" | "assistant"; parts: UIMessage["parts"] }>; run?: RunState };
      if (!response.ok || stopped || !payload.messages) return;
      setMessages(payload.messages as UIMessage[]);
      setRun(payload.run ?? null);
      if (payload.run?.status !== "running") window.dispatchEvent(new Event("chat-history-changed"));
    };
    const first = setTimeout(() => { void refresh(); }, 250);
    const timer = setInterval(() => { void refresh(); }, 500);
    return () => { stopped = true; clearTimeout(first); clearInterval(timer); };
  }, [conversationId, run?.status, setMessages]);
  useEffect(() => {
    if (!error) return;
    let stopped = false;
    const refreshFailure = async () => {
      const response = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
      const payload = await response.json() as { messages?: Array<{ id: string; role: "user" | "assistant"; parts: UIMessage["parts"] }>; run?: RunState };
      if (!response.ok || stopped) return;
      if (payload.messages) setMessages(payload.messages as UIMessage[]);
      setRun(payload.run ?? null);
      window.dispatchEvent(new Event("chat-history-changed"));
    };
    void refreshFailure();
    return () => { stopped = true; };
  }, [conversationId, error, setMessages]);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; title: string }>).detail;
      if (detail?.id === conversationId) setTitle(detail.title);
    };
    window.addEventListener("chat-title-changed", listener);
    return () => window.removeEventListener("chat-title-changed", listener);
  }, [conversationId]);
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) window.dispatchEvent(new Event("chat-history-changed"));
    wasBusy.current = busy;
  }, [busy]);
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
    if (title === "New tasting session") setTitle(text.slice(0, 60));
    setRun({ status: "running", safeError: null });
    const sending = sendMessage({ text });
    window.dispatchEvent(new Event("chat-history-changed"));
    await sending;
  }
  function shortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSubmitChatShortcut({
      key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey,
      altKey: event.altKey, repeat: event.repeat, composing: event.nativeEvent.isComposing,
    })) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
  return <div className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] flex-col md:h-[calc(100dvh-4rem)]">
    {tracePhase !== "hidden" && <NeuralTrace lines={traceRendered} dissolving={tracePhase === "dissolving"} />}
    <header className="border-b border-[var(--border)] pb-4">
      <h1 className="mb-3 truncate text-base text-[var(--text)]">{title}</h1>
      <p className="text-[11px] tracking-[0.18em] text-[var(--text-dim)]">PARTICIPANTS</p>
      <div className="mt-2 flex flex-wrap gap-3">{participants.map((profile) => <span key={profile.id} className={`text-xs tracking-[0.1em] bloom-${profile.color}`} style={{ color: `var(--${profile.color})` }}>{profile.name}</span>)}</div>
      <p className="mt-2 text-[11px] tracking-[0.18em] text-[var(--text-dim)]">MODEL: {model}</p>
    </header>
    <div ref={transcript} className="min-h-0 flex-1 space-y-7 overflow-y-auto py-6" aria-live="polite" data-testid="chat-transcript" data-final-output={finalTextBegan ? (tracePhase === "hidden" ? "visible" : "withheld") : "none"}>
      {messages.length === 0 && <p className="text-[var(--text-dim)]">Tell me what&apos;s in your glass, ask a wine question, or start with what you want to learn.</p>}
      {messages.map((message) => <article key={message.id} data-role={message.role}>
        <p className={message.role === "user" ? "text-[var(--cyan)]" : "text-[var(--text-dim)]"}>{message.role === "user" ? ">" : "somm@cellar:~$"}</p>
        <div className="mt-2 space-y-2 leading-7">{message.parts.map((part, index) => {
          // The trace keeps its specified decay, but the final output takes over only after the
          // overlay has unmounted. This prevents both animated layers from visibly competing.
          if (part.type === "text") {
            const waitingForTrace = message.id === assistant?.id && index === finalTextIndex && tracePhase !== "hidden";
            return waitingForTrace ? null : <p className="whitespace-pre-wrap" key={index}>{part.text}</p>;
          }
          // Reasoning summaries never enter the permanent transcript — they drive the transient
          // NEURAL TRACE overlay while streaming (specs/04, specs/10).
          if (part.type === "reasoning") return null;
          if (isToolPart(part)) return <ToolActivity key={(part as ToolPart).toolCallId ?? index} part={part as ToolPart} participants={participants} />;
          return null;
        })}</div>
      </article>)}
      {busy && <p className="cursor-block text-[var(--cyan)]">{run?.status === "running" && status === "ready" ? "CONTINUING RESPONSE…" : "▮"}</p>}
      {run && (run.status === "failed" || run.status === "interrupted") && <p className="text-[var(--magenta)]" role="status">{run.safeError}</p>}
      {error && !run?.safeError && <p className="text-[var(--magenta)]" role="alert">The response could not be generated. Please try again.</p>}
    </div>
    <form className="sticky bottom-0 flex gap-3 border-t border-[var(--border)] bg-[var(--bg)] py-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={submit}>
      <label className="sr-only" htmlFor="chat-message">Message</label>
      <div className="min-w-0 flex-1">
        <textarea id="chat-message" className="terminal-input min-h-14 resize-none !text-base" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={shortcut} aria-keyshortcuts="Meta+Enter Control+Enter" />
        <p className="mt-1 text-[10px] text-[var(--text-dim)]">⌘/Ctrl+Enter to send · Enter for new line</p>
      </div>
      <button className="terminal-button terminal-button--primary min-w-16" type="submit" aria-label="Send message" disabled={busy}>SEND</button>
    </form>
  </div>;
}
