"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Summary = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  status: "running" | "idle";
  participants: Array<{ id: string; name: string; color: "cyan" | "magenta" | "amber" | "green" }>;
};

export function ChatHistory({ full = false }: { full?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const paramsText = params.toString();
  const currentQuery = params.get("q") ?? "";
  const selectedId = pathname.match(/^\/chat\/([0-9a-f-]+)$/u)?.[1] ?? params.get("selected") ?? undefined;
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [rows, setRows] = useState<Summary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const load = useCallback(async (append = false, next = "") => {
    const search = new URLSearchParams({ limit: "25" });
    if (query.trim()) search.set("q", query.trim());
    if (next) search.set("cursor", next);
    const response = await fetch(`/api/conversations?${search}`);
    const payload = await response.json() as { conversations?: Summary[]; nextCursor?: string | null; error?: string };
    if (!response.ok || !payload.conversations) { setError(payload.error ?? "Could not load chat history."); return; }
    setRows((current) => append ? [...current, ...payload.conversations!.filter((row) => !current.some((item) => item.id === row.id))] : payload.conversations!);
    setCursor(payload.nextCursor ?? null);
    setError("");
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim() !== currentQuery.trim()) {
        const next = new URLSearchParams(paramsText);
        if (query.trim()) next.set("q", query.trim()); else next.delete("q");
        router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
      }
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [currentQuery, load, paramsText, pathname, query, router]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener("chat-history-changed", refresh);
    return () => window.removeEventListener("chat-history-changed", refresh);
  }, [load]);

  async function rename(event: FormEvent, row: Summary) {
    event.preventDefault();
    const response = await fetch(`/api/conversations/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: renameTitle }) });
    const payload = await response.json() as { conversation?: { title: string }; error?: string };
    if (!response.ok || !payload.conversation) { setError(payload.error ?? "Could not rename chat."); return; }
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, title: payload.conversation!.title } : item));
    setRenaming(null);
    window.dispatchEvent(new CustomEvent("chat-title-changed", { detail: { id: row.id, title: payload.conversation.title } }));
  }

  async function remove(row: Summary) {
    if (!window.confirm(`Delete chat “${row.title}”? This cannot be undone.`)) return;
    const response = await fetch(`/api/conversations/${row.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json() as { error?: string };
      setError(payload.error ?? "Could not delete chat."); return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    if (selectedId === row.id) router.push("/chat");
  }

  return <section className={`flex min-h-0 flex-col ${full ? "h-full" : "h-[calc(100dvh-4rem)]"}`} aria-label="Chat history">
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
      <h1 className="text-xs tracking-[0.16em]">CHAT HISTORY</h1>
      <Link className="terminal-button inline-flex min-h-11 items-center no-underline" href="/chat">NEW CHAT</Link>
    </div>
    <div className="p-4">
      <label className="mb-1 block text-xs tracking-[0.1em]" htmlFor={full ? "history-search-full" : "history-search"}>SEARCH CHAT TITLES</label>
      <input id={full ? "history-search-full" : "history-search"} className="terminal-input min-h-11" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {error && <p className="mx-4 mb-3 text-xs text-[var(--magenta)]" role="alert">{error}</p>}
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4" data-testid="history-list">
      {rows.length === 0 ? <div className="p-4 text-sm text-[var(--text-dim)]"><p>Prior chats will appear here.</p><Link className="mt-4 inline-block" href="/chat">NEW CHAT</Link></div> : rows.map((row) => <article className={`border-b border-[var(--border)] p-3 ${selectedId === row.id ? "bg-[var(--bg-raised)]" : ""}`} key={row.id}>
        <a className="block min-h-11 min-w-0 no-underline" href={`/chat/${row.id}`} aria-current={selectedId === row.id ? "page" : undefined}>
          <span className="block truncate text-sm text-[var(--text)]">{row.title}</span>
          <span className="mt-1 flex flex-wrap gap-2 text-[11px]">{row.participants.map((profile) => <span key={profile.id} style={{ color: `var(--${profile.color})` }}>{profile.name}</span>)}</span>
          <span className="mt-1 block truncate text-xs text-[var(--text-dim)]">{row.status === "running" ? "GENERATING · " : ""}{row.preview}</span>
          <time className="mt-1 block text-[10px] text-[var(--text-dim)]" dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleString()}</time>
        </a>
        {renaming === row.id ? <form className="mt-2 flex gap-2" onSubmit={(event) => { void rename(event, row); }}>
          <label className="sr-only" htmlFor={`rename-${row.id}`}>New title for {row.title}</label>
          <input id={`rename-${row.id}`} className="terminal-input min-h-11 min-w-0" maxLength={60} value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} autoFocus />
          <button className="terminal-button min-h-11" type="submit">SAVE</button>
        </form> : <div className="mt-2 flex gap-2">
          <button className="terminal-button min-h-11" type="button" disabled={row.status === "running"} onClick={() => { setRenaming(row.id); setRenameTitle(row.title); }}>RENAME</button>
          <button className="terminal-button min-h-11" type="button" disabled={row.status === "running"} onClick={() => { void remove(row); }}>DELETE CHAT</button>
        </div>}
      </article>)}
      {cursor && <button className="terminal-button mx-2 mt-4 min-h-11 w-[calc(100%-1rem)]" type="button" onClick={() => { void load(true, cursor); }}>LOAD MORE</button>}
    </div>
  </section>;
}
