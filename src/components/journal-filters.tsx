"use client";

import { useRouter } from "next/navigation";
import type { Profile } from "@/db/schema";

export function JournalFilters({ profiles, values }: { profiles: Profile[]; values: { taster?: string; verdict?: string; style?: string } }) {
  const router = useRouter();
  function update(name: string, value: string) {
    const params = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
    if (value) params.set(name, value); else params.delete(name);
    router.push(`/journal${params.size ? `?${params}` : ""}`);
  }
  return <div className="grid gap-3 sm:grid-cols-3">
    <label><span className="mb-1 block text-xs text-[var(--text-dim)]">TASTER</span><select className="terminal-input" value={values.taster ?? ""} onChange={(event) => update("taster", event.target.value)}><option value="">ALL TASTERS</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
    <label><span className="mb-1 block text-xs text-[var(--text-dim)]">VERDICT</span><select className="terminal-input" value={values.verdict ?? ""} onChange={(event) => update("verdict", event.target.value)}><option value="">ALL VERDICTS</option>{["liked", "mixed", "disliked"].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label><span className="mb-1 block text-xs text-[var(--text-dim)]">STYLE</span><select className="terminal-input" value={values.style ?? ""} onChange={(event) => update("style", event.target.value)}><option value="">ALL STYLES</option>{["red", "white", "rose", "sparkling", "dessert", "fortified", "orange"].map((value) => <option key={value}>{value}</option>)}</select></label>
  </div>;
}
