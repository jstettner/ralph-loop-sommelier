"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "@/db/schema";

export function ChatClient({ conversationId, initialMessages, participants, model, starter }: {
  conversationId: string; initialMessages: UIMessage[]; participants: Profile[]; model: string; starter?: string;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", body: { conversationId } }), [conversationId]);
  const { messages, sendMessage, status, error } = useChat({ id: conversationId, messages: initialMessages, transport });
  const [input, setInput] = useState(starter ?? "");
  const transcript = useRef<HTMLDivElement>(null);
  const starterSent = useRef(false);
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
    if (!text || status === "streaming" || status === "submitted") return;
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
        <div className="mt-2 space-y-2 leading-7">{message.parts.map((part, index) => part.type === "text"
          ? <p className="whitespace-pre-wrap" key={index}>{part.text}</p>
          : part.type.startsWith("tool-") ? <p className="text-xs tracking-[0.08em] text-[var(--text-dim)]" key={index}>[tool] {part.type.slice(5).replaceAll("_", " ")}</p> : null)}</div>
      </article>)}
      {(status === "streaming" || status === "submitted") && <p className="cursor-block text-[var(--cyan)]">▮</p>}
      {error && <p className="text-[var(--magenta)]" role="alert">{error.message}</p>}
    </div>
    <form className="sticky bottom-0 flex gap-3 border-t border-[var(--border)] bg-[var(--bg)] py-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={submit}>
      <label className="sr-only" htmlFor="chat-message">Message</label>
      <textarea id="chat-message" className="terminal-input min-h-14 resize-none !text-base" value={input} onChange={(event) => setInput(event.target.value)} />
      <button className="terminal-button terminal-button--primary min-w-16" type="submit" aria-label="Send message" disabled={status === "streaming" || status === "submitted"}>SEND</button>
    </form>
  </div>;
}
