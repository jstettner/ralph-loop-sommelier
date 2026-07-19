"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateRecommendations({ mode }: { mode: "profile" | "joint" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setPending(true); setError("");
    const response = await fetch("/api/recommendations/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
    if (!response.ok) { setError(((await response.json()) as { error?: string }).error ?? "Generation failed."); setPending(false); return; }
    router.refresh(); setPending(false);
  }
  return <div><button className="terminal-button" type="button" onClick={generate} disabled={pending}>{pending ? "THINKING…" : mode === "joint" ? "SUGGEST A BOTTLE FOR ALL OF US" : "SUGGEST MY NEXT BOTTLE"}</button>{error && <p className="mt-2 text-sm text-[var(--magenta)]" role="alert">{error}</p>}</div>;
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
  return <div className="mt-4 flex flex-wrap gap-2">{(["purchased", "tasted", "dismissed"] as const).map((status) => <button key={status} className="min-h-11 border border-[var(--border)] px-3 text-xs uppercase text-[var(--text-dim)]" type="button" disabled={pending} onClick={() => setStatus(status)}>{status}</button>)}</div>;
}
