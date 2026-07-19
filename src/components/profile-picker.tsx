"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Profile } from "@/db/schema";
import { WineGlass } from "@/components/icons";

export function ProfilePicker({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function choose(profileId: string) {
    setError("");
    const response = await fetch("/api/profiles/active", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId }),
    });
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      setError(body.error ?? "Could not select profile.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {profiles.map((profile) => (
        <button key={profile.id} type="button" onClick={() => choose(profile.id)}
          className={`profile-tile tracking-[0.1em] bloom-${profile.color}`} style={{ color: `var(--${profile.color})` }}>
          <WineGlass color={`var(--${profile.color})`} /> {profile.name}
        </button>
      ))}
      {profiles.length < 4
        ? <Link className="profile-tile text-xs tracking-[0.1em] text-[var(--text-dim)] no-underline transition-colors hover:text-[var(--text)]" href="/profiles/new">+ NEW TASTER</Link>
        : <span className="profile-tile cursor-not-allowed text-xs tracking-[0.1em] text-[var(--text-dim)]" aria-disabled="true">PROFILE LIMIT REACHED</span>}
      {error && <p className="text-sm text-[var(--magenta)]" role="alert">{error}</p>}
    </div>
  );
}
