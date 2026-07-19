import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Corkscrew, GrapeCluster } from "@/components/icons";
import { db } from "@/db/client";
import { grapes } from "@/db/schema";
import { grapeAppearance } from "@/lib/grape-appearance";

export default async function GrapePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const grape = db.select().from(grapes).where(eq(grapes.slug, slug)).get();
  if (!grape) notFound();
  const starter = `I want to taste ${grape.name}. Please guide me through one bottle.`;
  return <article className="mx-auto max-w-3xl space-y-9"><header><Link className="text-xs tracking-[0.1em]" href="/grapes">← GRAPE LIBRARY</Link><div className="mt-6 flex items-center gap-4"><GrapeCluster size={32} appearance={grapeAppearance(grape.slug, grape.color)} /><div><p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-dim)]">{grape.color} grape · lesson {grape.orderIndex}</p><h1 className="text-2xl">{grape.name}</h1></div></div>{grape.aka.length > 0 && <p className="mt-3 text-xs tracking-[0.08em] text-[var(--text-dim)]">ALSO KNOWN AS: {grape.aka.join(", ")}</p>}</header>
    <section><h2 className="section-header mb-3">── PROFILE ──</h2><p className="leading-7">{grape.profile}</p></section>
    <section><h2 className="section-header mb-3">── CLASSIC REGIONS ──</h2><ul className="space-y-2">{grape.classicRegions.map((region) => <li key={region}>› {region}</li>)}</ul></section>
    <section><h2 className="section-header mb-3">── WHAT TO TASTE FOR ──</h2><p className="leading-7">{grape.whatToTasteFor}</p></section>
    <section><h2 className="section-header mb-3">── BENCHMARK STYLES ──</h2><ul className="space-y-2">{grape.benchmarkStyles.map((style) => <li key={style}>› {style}</li>)}</ul></section>
    <Link className="terminal-button terminal-button--primary inline-flex items-center gap-3 no-underline" href={`/chat?starter=${encodeURIComponent(starter)}`}><Corkscrew size={16} /> TASTE THIS GRAPE WITH ME</Link>
  </article>;
}
