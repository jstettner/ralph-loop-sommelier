"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NeuralTrace } from "@/components/neural-trace";

type Chunk = { type?: string; delta?: string; toolCallId?: string; input?: { wine_name?: string } };

export function GenerateRecommendations({ mode }: { mode: "profile" | "joint" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"hidden" | "open" | "dissolving">("hidden");
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (phase !== "dissolving") return;
    const timer = setTimeout(() => setPhase("hidden"), 800);
    return () => clearTimeout(timer);
  }, [phase]);

  async function generate() {
    setPending(true); setError(""); setLines([]); setPhase("hidden");
    let response: Response;
    try {
      response = await fetch("/api/recommendations/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
    } catch {
      setError("Generation failed."); setPending(false); return;
    }
    if (!response.ok || !response.body) {
      setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Generation failed.");
      setPending(false); setPhase("hidden"); return;
    }
    // Drive the NEURAL TRACE overlay from the streamed reasoning + safe save_recommendation state.
    const target = mode === "joint" ? "for the table" : "for you";
    let reasoning = "";
    const toolLines = new Map<string, string>();
    const render = () => {
      const next = [...(reasoning.trim() ? [`· ${reasoning.trim()}`] : []), ...toolLines.values()];
      setLines(next);
      if (next.length) setPhase("open");
    };
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const rows = buffer.split("\n");
        buffer = rows.pop() ?? "";
        for (const row of rows) {
          if (!row.startsWith("data: ")) continue;
          const data = row.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          let chunk: Chunk;
          try { chunk = JSON.parse(data) as Chunk; } catch { continue; }
          if (chunk.type === "reasoning-delta" && typeof chunk.delta === "string") { reasoning += chunk.delta; render(); }
          else if ((chunk.type === "tool-input-start" || chunk.type === "tool-input-available") && chunk.toolCallId) {
            const wine = chunk.input?.wine_name;
            toolLines.set(chunk.toolCallId, `▸ Saving recommendation — ${[wine, target].filter(Boolean).join(" · ")}`);
            render();
          }
        }
      }
    } catch {
      setError("Generation was interrupted."); setPhase((prev) => (prev === "open" ? "dissolving" : "hidden")); setPending(false); return;
    }
    setPhase((prev) => (prev === "open" ? "dissolving" : "hidden"));
    router.refresh();
    setPending(false);
  }

  return <div>
    {phase !== "hidden" && <NeuralTrace lines={lines} dissolving={phase === "dissolving"} />}
    <button className="terminal-button terminal-button--primary" type="button" onClick={generate} disabled={pending}>{pending ? "THINKING…" : mode === "joint" ? "SUGGEST A BOTTLE FOR ALL OF US" : "SUGGEST MY NEXT BOTTLE"}</button>
    {error && <p className="mt-2 text-sm text-[var(--magenta)]" role="alert">{error}</p>}
  </div>;
}

export function RecommendationStatus({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function setStatus(status: "purchased" | "tasted" | "dismissed") {
    setPending(true);
    const response = await fetch(`/api/recommendations/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) router.refresh();
    setPending(false);
  }
  return <div className="mt-4 flex flex-wrap gap-2">{(["purchased", "tasted", "dismissed"] as const).map((status) => <button key={status} className="min-h-11 cursor-pointer border border-[var(--border)] px-3 text-xs uppercase tracking-[0.1em] text-[var(--text-dim)] transition-colors hover:border-[var(--border-bright)] hover:text-[var(--text)]" type="button" disabled={pending} onClick={() => setStatus(status)}>{status}</button>)}</div>;
}
