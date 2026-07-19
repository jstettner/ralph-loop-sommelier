"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatHistory } from "@/components/chat-history";

export function ChatShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const selectedId = pathname.match(/^\/chat\/([0-9a-f-]+)$/u)?.[1];
  return <div className="min-w-0 md:grid md:grid-cols-[minmax(250px,320px)_minmax(0,1fr)] md:gap-6">
    <aside className="hidden min-h-0 border-r border-[var(--border)] md:block"><ChatHistory /></aside>
    <div className="min-w-0">
      <nav className="mb-4 flex gap-3 md:hidden" aria-label="Chat controls">
        <Link className="terminal-button inline-flex min-h-11 items-center no-underline" href={selectedId ? `/chat/history?selected=${selectedId}` : "/chat/history"}>HISTORY</Link>
        <Link className="terminal-button inline-flex min-h-11 items-center no-underline" href="/chat">NEW CHAT</Link>
      </nav>
      {children}
    </div>
  </div>;
}
