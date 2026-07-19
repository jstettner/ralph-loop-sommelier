import Link from "next/link";
import { db } from "@/db/client";
import { grapes } from "@/db/schema";
import { GrapeCluster } from "@/components/icons";

export default function GrapesPage() {
  const curriculum = db.select().from(grapes).orderBy(grapes.orderIndex).all();
  return <div className="mx-auto max-w-5xl space-y-8"><header><p className="text-sm text-[var(--text-dim)]">somm@cellar:~$ curriculum --list</p><h1 className="bloom-cyan mt-2 flex items-center gap-3 text-2xl text-[var(--cyan)]"><GrapeCluster /> ── GRAPE LIBRARY ──</h1><p className="mt-3 text-[var(--text-dim)]">Eighteen useful grapes, ordered from clear contrasts toward a broader map of wine.</p></header>
    <ol className="grid gap-4 md:grid-cols-2">{curriculum.map((grape) => <li key={grape.id}><Link className="flex min-h-24 items-center gap-4 border border-[var(--border)] bg-[var(--bg-raised)] p-5 text-[var(--text)] no-underline" href={`/grapes/${grape.slug}`}><GrapeCluster color={grape.color === "red" ? "var(--magenta)" : "var(--amber)"} /><span><span className="text-xs text-[var(--text-dim)]">{String(grape.orderIndex).padStart(2, "0")} · {grape.color.toUpperCase()}</span><strong className="mt-1 block font-normal">{grape.name}</strong></span></Link></li>)}</ol>
  </div>;
}
