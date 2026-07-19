import Link from "next/link";
import { db } from "@/db/client";
import { grapes } from "@/db/schema";
import { GrapeCluster } from "@/components/icons";
import { grapeAppearance } from "@/lib/grape-appearance";

export default function GrapesPage() {
  const curriculum = db.select().from(grapes).orderBy(grapes.orderIndex).all();
  return <div className="mx-auto max-w-5xl space-y-8"><header><p className="prompt-line">somm@cellar:~$ curriculum --list</p><h1 className="page-title bloom-cyan mt-3 text-[var(--cyan)]"><GrapeCluster size={16} /> ── GRAPE LIBRARY ──</h1><p className="mt-3 text-sm text-[var(--text-dim)]">Eighteen useful grapes, ordered from clear contrasts toward a broader map of wine.</p></header>
    <ol className="grid gap-4 md:grid-cols-2">{curriculum.map((grape) => <li key={grape.id}><Link className="flex min-h-24 items-center gap-4 border border-[var(--border)] bg-[var(--bg-raised)] p-5 text-[var(--text)] no-underline transition-colors hover:border-[var(--border-bright)]" href={`/grapes/${grape.slug}`}><GrapeCluster appearance={grapeAppearance(grape.slug, grape.color)} /><span><span className="text-[11px] tracking-[0.12em] text-[var(--text-dim)]">{String(grape.orderIndex).padStart(2, "0")} · {grape.color.toUpperCase()}</span><strong className="mt-1 block font-normal">{grape.name}</strong></span></Link></li>)}</ol>
  </div>;
}
