"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    const result = mode === "signup"
      ? await authClient.signUp.email({ email, password, name: email })
      : await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message ?? "Authentication failed.");
      setPending(false);
      return;
    }
    if (mode === "signup") {
      router.push("/profiles/new");
      router.refresh();
      return;
    }
    const profileResponse = await fetch("/api/profiles");
    const payload = await profileResponse.json() as { profiles?: Array<{ id: string }> };
    if (!profileResponse.ok || !payload.profiles) {
      setError("Could not load household profiles.");
      setPending(false);
      return;
    }
    if (payload.profiles.length === 0) {
      router.push("/profiles/new");
    } else if (payload.profiles.length === 1) {
      await fetch("/api/profiles/active", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: payload.profiles[0]?.id }),
      });
      router.push("/dashboard");
    } else {
      router.push("/profiles");
    }
    router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <label className="block">
        <span className="form-label">EMAIL</span>
        <input className="terminal-input" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="block">
        <span className="form-label">PASSWORD</span>
        <input className="terminal-input" name="password" type="password" minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
      </label>
      {error && <p className="text-sm text-[var(--magenta)]" role="alert">{error}</p>}
      <button className="terminal-button terminal-button--primary w-full" type="submit" disabled={pending}>
        {pending ? "WORKING…" : mode === "signup" ? "CREATE HOUSEHOLD" : "LOG IN"}
      </button>
      <p className="text-xs text-[var(--text-dim)]">
        {mode === "signup" ? "Already have a household? " : "New to Wine Trainer? "}
        <Link className="tracking-[0.1em]" href={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "LOG IN" : "SIGN UP"}</Link>
      </p>
    </form>
  );
}
