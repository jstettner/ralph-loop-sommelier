"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ProfileManager({ profileId, name }: { profileId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newName = String(new FormData(event.currentTarget).get("name") ?? "");
    const response = await fetch(`/api/profiles/${profileId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newName }) });
    if (!response.ok) { setError(((await response.json()) as { error?: string }).error ?? "Rename failed."); return; }
    setError(""); router.refresh();
  }
  async function remove() {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    const response = await fetch(`/api/profiles/${profileId}`, { method: "DELETE" });
    if (!response.ok) { setError(((await response.json()) as { error?: string }).error ?? "Delete failed."); return; }
    router.push("/profiles"); router.refresh();
  }
  return <div className="space-y-4 border-t border-[var(--border)] pt-8">
    <form className="flex flex-col gap-3 sm:flex-row" onSubmit={rename}><input className="terminal-input" name="name" defaultValue={name} minLength={1} maxLength={24} required /><button className="terminal-button shrink-0" type="submit">RENAME</button></form>
    {error && <p className="text-[var(--magenta)]" role="alert">{error}</p>}
    <button className="min-h-11 border border-[var(--magenta)] px-4 text-[var(--magenta)]" type="button" onClick={remove}>DELETE PROFILE</button>
  </div>;
}
