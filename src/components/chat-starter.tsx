"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ModelInfo } from "@/lib/llm/registry";
import type { Profile } from "@/db/schema";

export function ChatStarter({ profiles, activeProfileId, models, defaultModel }: {
  profiles: Profile[]; activeProfileId: string; models: ModelInfo[]; defaultModel: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [participants, setParticipants] = useState([activeProfileId]);
  const [model, setModel] = useState(defaultModel);
  const [error, setError] = useState("");
  const starter = search.get("starter") ?? "";

  function toggle(profileId: string) {
    setParticipants((current) => current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId]);
  }
  async function start() {
    if (!participants.length) { setError("Choose at least one taster."); return; }
    const response = await fetch("/api/conversations", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ participantIds: participants, model }),
    });
    const payload = await response.json() as { conversation?: { id: string }; error?: string };
    if (!response.ok || !payload.conversation) { setError(payload.error ?? "Could not start chat."); return; }
    const query = starter ? `?starter=${encodeURIComponent(starter)}` : "";
    router.push(`/chat/${payload.conversation.id}${query}`);
  }
  return <section className="max-w-2xl border border-[var(--border)] bg-[var(--bg-raised)] p-6 md:p-10">
    <h1 className="bloom-cyan mb-2 text-2xl text-[var(--cyan)]">NEW TASTING SESSION</h1>
    <p className="mb-8 text-[var(--text-dim)]">Choose who is at the table. Participants stay fixed for this conversation.</p>
    <fieldset className="space-y-3"><legend className="mb-3">WHO&apos;S TASTING?</legend>{profiles.map((profile) =>
      <label key={profile.id} className="flex min-h-14 cursor-pointer items-center gap-4 border border-[var(--border)] px-4">
        <input type="checkbox" checked={participants.includes(profile.id)} onChange={() => toggle(profile.id)} />
        <span className={`bloom-${profile.color}`} style={{ color: `var(--${profile.color})` }}>{profile.name}</span>
      </label>)}</fieldset>
    {profiles.length > 1 && <p className="mt-3 text-sm text-[var(--cyan)]">+ TASTE TOGETHER: select another taster above</p>}
    <label className="mt-8 block"><span className="mb-2 block text-sm text-[var(--text-dim)]">MODEL</span>
      <select className="terminal-input" value={model} onChange={(event) => setModel(event.target.value)}>{models.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    </label>
    {starter && <p className="mt-5 border-l border-[var(--cyan)] pl-4 text-sm">Starter: {starter}</p>}
    {error && <p role="alert" className="mt-4 text-[var(--magenta)]">{error}</p>}
    <button className="terminal-button mt-8 w-full" type="button" onClick={start}>START CHAT</button>
  </section>;
}
