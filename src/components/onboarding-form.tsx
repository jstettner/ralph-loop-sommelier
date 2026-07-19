"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const choices = {
  coffee: [["black", "Black"], ["milk", "With milk"], ["sweet", "Sweet"], ["none", "I don't drink coffee"]],
  juice: [["grapefruit", "Grapefruit"], ["orange", "Orange"]],
  tea: [["strong", "Strong-steeped"], ["light", "Light"]],
  chocolate: [["dark", "Dark chocolate"], ["milk", "Milk chocolate"]],
} as const;

function RadioQuestion({ name, title, options }: { name: string; title: string; options: readonly (readonly [string, string])[] }) {
  return (
    <fieldset className="space-y-3 border-t border-[var(--border)] pt-6">
      <legend className="mb-3 text-xs tracking-[0.12em] text-[var(--text)]">{title}</legend>
      {options.map(([value, label]) => <label className="flex min-h-11 items-center gap-3" key={value}>
        <input className="accent-[var(--cyan)]" type="radio" name={name} value={value} required /> {label}
      </label>)}
    </fieldset>
  );
}

export function OnboardingForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function finish(response: Response) {
    if (!response.ok) {
      const payload = await response.json() as { error?: string };
      setError(payload.error ?? "Could not save your palate.");
      setPending(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    await finish(await fetch("/api/palate", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        coffee: form.get("coffee"), juice: form.get("juice"), tea: form.get("tea"),
        chocolate: form.get("chocolate"), enjoyed: form.getAll("enjoyed"),
        adventurousness: Number(form.get("adventurousness")),
      }),
    }));
  }
  async function skip() {
    setPending(true);
    setError("");
    await finish(await fetch("/api/palate", { method: "DELETE" }));
  }
  return (
    <form className="space-y-8" onSubmit={submit}>
      <RadioQuestion name="coffee" title="1. HOW DO YOU TAKE YOUR COFFEE?" options={choices.coffee} />
      <RadioQuestion name="juice" title="2. GRAPEFRUIT OR ORANGE JUICE?" options={choices.juice} />
      <RadioQuestion name="tea" title="3. HOW DO YOU TAKE YOUR TEA?" options={choices.tea} />
      <RadioQuestion name="chocolate" title="4. DARK OR MILK CHOCOLATE?" options={choices.chocolate} />
      <fieldset className="space-y-3 border-t border-[var(--border)] pt-6">
        <legend className="mb-3 text-xs tracking-[0.12em]">5. WHAT HAVE YOU ENJOYED DRINKING?</legend>
        {[["bold_reds", "Bold reds"], ["light_reds", "Light reds"], ["crisp_whites", "Crisp whites"],
          ["rich_whites", "Rich whites"], ["rose", "Rosé"], ["bubbles", "Bubbles"], ["none", "None yet"]].map(([value, label]) =>
          <label className="flex min-h-11 items-center gap-3" key={value}><input className="accent-[var(--cyan)]" type="checkbox" name="enjoyed" value={value} /> {label}</label>)}
      </fieldset>
      <label className="block border-t border-[var(--border)] pt-6">
        <span className="mb-4 block text-xs tracking-[0.12em]">6. HOW ADVENTUROUS ARE YOU FEELING? (1–5)</span>
        <input className="w-full accent-[var(--cyan)]" name="adventurousness" type="range" min="1" max="5" defaultValue="3" />
      </label>
      {error && <p className="text-[var(--magenta)]" role="alert">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button className="terminal-button terminal-button--primary flex-1" type="submit" disabled={pending}>SAVE MY PALATE</button>
        <button className="terminal-button" type="button" onClick={skip} disabled={pending}>
          I&apos;LL FIGURE IT OUT AS I GO
        </button>
      </div>
    </form>
  );
}
