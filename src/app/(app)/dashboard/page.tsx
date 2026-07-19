import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { palateProfiles, recommendations, tastingNotes, wines } from "@/db/schema";
import { GenerateRecommendations, RecommendationStatus } from "@/components/recommendation-controls";
import { listProfiles } from "@/server/profiles";
import { Barrel, Bottle, Sparkle } from "@/components/icons";
import { getActiveProfile, getHouseholdSession } from "@/server/session";

export default async function DashboardPage() {
  const session = await getHouseholdSession();
  if (!session) return null;
  const profile = await getActiveProfile(session);
  if (!profile) return null;
  const householdProfiles = listProfiles(session.user.id);
  const palate = db.select().from(palateProfiles).where(eq(palateProfiles.profileId, profile.id)).get();
  const upNext = db.select().from(recommendations).where(and(
    eq(recommendations.householdId, session.user.id), eq(recommendations.profileId, profile.id),
    inArray(recommendations.status, ["suggested", "purchased"]),
  )).orderBy(desc(recommendations.createdAt)).all();
  const joint = db.select().from(recommendations).where(and(
    eq(recommendations.householdId, session.user.id), isNull(recommendations.profileId),
    inArray(recommendations.status, ["suggested", "purchased"]),
  )).orderBy(desc(recommendations.createdAt)).all();
  const recent = db.select({ note: tastingNotes, wine: wines }).from(tastingNotes)
    .innerJoin(wines, eq(tastingNotes.wineId, wines.id))
    .where(eq(tastingNotes.householdId, session.user.id)).orderBy(desc(tastingNotes.createdAt)).limit(5).all();
  const dimensions = ["sweetness", "acidity", "tannin", "body", "oak", "adventurousness"] as const;
  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <header><p className="prompt-line">somm@cellar:~$ dashboard --taster={profile.name}</p>
        <h1 className="page-title bloom-cyan mt-3 text-[var(--cyan)]"><Barrel size={16} /> ── CELLAR DASHBOARD ──</h1></header>
      <section><h2 className="section-header mb-4"><Bottle size={16} color="var(--amber)" /> ── UP NEXT FOR {profile.name.toLocaleUpperCase()} ──</h2>
        {upNext.length ? <div className="mb-5 grid gap-4 md:grid-cols-2">{upNext.map((item) => <article className="border border-[var(--border)] bg-[var(--bg-raised)] p-5 transition-colors hover:border-[var(--border-bright)]" key={item.id}><h3>{item.wineName}</h3><p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-dim)]">{item.grape} {item.region} {item.priceBand}</p><p className="mt-2 text-sm text-[var(--text-dim)]">{item.reasoning}</p><RecommendationStatus id={item.id} /></article>)}</div>
          : <p className="text-[var(--text-dim)]">No bottles queued. <Link href="/chat">Ask the sommelier what to try next.</Link></p>}
        <div className="mt-5"><GenerateRecommendations mode="profile" /></div>
      </section>
      {householdProfiles.length >= 2 && <section><h2 className="section-header mb-4"><Sparkle size={16} color="var(--magenta)" /> ── FOR THE TABLE ──</h2>{joint.length ? <div className="mb-5 grid gap-4 md:grid-cols-2">{joint.map((item) => <article className="border border-[var(--border)] bg-[var(--bg-raised)] p-5 transition-colors hover:border-[var(--border-bright)]" key={item.id}><h3>{item.wineName}</h3><p className="mt-2 text-sm text-[var(--text-dim)]">{item.reasoning}</p><div className="mt-3 flex gap-3">{householdProfiles.map((householdProfile) => <span className={`text-xs tracking-[0.1em] bloom-${householdProfile.color}`} style={{ color: `var(--${householdProfile.color})` }} key={householdProfile.id}>{householdProfile.name}</span>)}</div><RecommendationStatus id={item.id} /></article>)}</div> : <p className="mb-5 text-[var(--text-dim)]">No shared bottle queued yet.</p>}<GenerateRecommendations mode="joint" /></section>}
      <section><h2 className="section-header mb-4">── RECENT TASTINGS ──</h2>{recent.length ? recent.map(({ note, wine }) => <p key={note.id}>{wine.name} · <span className="text-[var(--text-dim)]">{note.verdict}</span></p>) : <p className="text-[var(--text-dim)]">Your journal is ready for its first bottle.</p>}</section>
      <section><h2 className="section-header mb-4">── PALATE SNAPSHOT ──</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{dimensions.map((dimension) => <p key={dimension}><span className="text-[11px] tracking-[0.18em] text-[var(--text-dim)]">{dimension.toUpperCase()}</span><br />{palate?.[dimension] ?? "--"}/5</p>)}</div><Link className="mt-4 inline-block text-xs tracking-[0.1em]" href="/profile">VIEW FULL PROFILE →</Link></section>
    </div>
  );
}
