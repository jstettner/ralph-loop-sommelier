"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function CreateProfileForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    const response = await fetch("/api/profiles", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      setError(body.error ?? "Could not create profile.");
      setPending(false);
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }
  return (
    <form className="space-y-6" onSubmit={submit}>
      <label className="block">
        <span className="form-label">TASTER NAME</span>
        <input className="terminal-input" name="name" minLength={1} maxLength={24} autoFocus required />
      </label>
      {error && <p className="text-sm text-[var(--magenta)]" role="alert">{error}</p>}
      <button className="terminal-button terminal-button--primary w-full" type="submit" disabled={pending}>{pending ? "CREATING…" : "CREATE TASTER"}</button>
    </form>
  );
}
