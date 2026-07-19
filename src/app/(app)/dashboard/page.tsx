import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { palateProfiles, recommendations, tastingNotes, wines } from "@/db/schema";
import { getActiveProfile, getHouseholdSession } from "@/server/session";

export default async function DashboardPage() {
  const session = await getHouseholdSession();
  if (!session) return null;
  const profile = await getActiveProfile(session);
  if (!profile) return null;
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
      <header><p className="text-sm text-[var(--text-dim)]">somm@cellar:~$ dashboard --taster={profile.name}</p>
        <h1 className="bloom-cyan mt-2 text-2xl text-[var(--cyan)]">── CELLAR DASHBOARD ──</h1></header>
      <section><h2 className="mb-4 text-[var(--amber)]">── UP NEXT FOR {profile.name.toLocaleUpperCase()} ──</h2>
        {upNext.length ? <div className="grid gap-4 md:grid-cols-2">{upNext.map((item) => <article className="border border-[var(--border)] p-5" key={item.id}><h3>{item.wineName}</h3><p className="mt-2 text-sm text-[var(--text-dim)]">{item.reasoning}</p></article>)}</div>
          : <p className="text-[var(--text-dim)]">No bottles queued. <Link href="/chat">Ask the sommelier what to try next.</Link></p>}
      </section>
      {joint.length > 0 && <section><h2 className="mb-4 text-[var(--magenta)]">── FOR THE TABLE ──</h2>{joint.map((item) => <article className="border border-[var(--border)] p-5" key={item.id}><h3>{item.wineName}</h3><p>{item.reasoning}</p></article>)}</section>}
      <section><h2 className="mb-4">── RECENT TASTINGS ──</h2>{recent.length ? recent.map(({ note, wine }) => <p key={note.id}>{wine.name} · {note.verdict}</p>) : <p className="text-[var(--text-dim)]">Your journal is ready for its first bottle.</p>}</section>
      <section><h2 className="mb-4">── PALATE SNAPSHOT ──</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{dimensions.map((dimension) => <p key={dimension}><span className="text-[var(--text-dim)]">{dimension.toUpperCase()}</span><br />{palate?.[dimension] ?? "--"}/5</p>)}</div><Link className="mt-4 inline-block" href="/profile">VIEW FULL PROFILE →</Link></section>
    </div>
  );
}
