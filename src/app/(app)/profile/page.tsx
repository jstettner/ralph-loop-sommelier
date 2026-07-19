import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { palateProfiles, tastingNotes, wines } from "@/db/schema";
import { ProfileManager } from "@/components/profile-manager";
import { getActiveProfile, getHouseholdSession } from "@/server/session";

export default async function ProfilePage() {
  const session = await getHouseholdSession();
  if (!session) return null;
  const profile = await getActiveProfile(session);
  if (!profile) return null;
  const palate = db.select().from(palateProfiles).where(eq(palateProfiles.profileId, profile.id)).get();
  const notes = db.select({ verdict: tastingNotes.verdict, wineName: wines.name }).from(tastingNotes)
    .innerJoin(wines, eq(tastingNotes.wineId, wines.id)).where(and(eq(tastingNotes.householdId, session.user.id), eq(tastingNotes.profileId, profile.id))).all();
  const dimensions = ["sweetness", "acidity", "tannin", "body", "oak", "adventurousness"] as const;
  return <div className="mx-auto max-w-3xl space-y-10"><header><p className="text-[var(--text-dim)]">somm@cellar:~$ palate --inspect</p><h1 className={`bloom-${profile.color} mt-2 text-2xl`} style={{ color: `var(--${profile.color})` }}>{profile.name}</h1></header>
    <section><h2 className="mb-5">── PALATE DIMENSIONS ──</h2><div className="grid grid-cols-2 gap-5 sm:grid-cols-3">{dimensions.map((dimension) => <div key={dimension}><p className="text-sm text-[var(--text-dim)]">{dimension.toUpperCase()}</p><p className="text-lg">{palate?.[dimension] ?? "--"} / 5</p></div>)}</div></section>
    <section><h2 className="mb-3">── SOMMELIER NOTES ──</h2><p className="whitespace-pre-wrap text-[var(--text-dim)]">{palate?.notes || "No observations recorded yet."}</p></section>
    <section className="grid gap-8 sm:grid-cols-2"><div><h2 className="mb-3 text-[var(--green)]">LIKED</h2>{notes.filter((note) => note.verdict === "liked").map((note, index) => <p key={`${note.wineName}-${index}`}>{note.wineName}</p>)}</div><div><h2 className="mb-3 text-[var(--magenta)]">DISLIKED</h2>{notes.filter((note) => note.verdict === "disliked").map((note, index) => <p key={`${note.wineName}-${index}`}>{note.wineName}</p>)}</div></section>
    <Link className="inline-flex min-h-11 items-center" href="/onboarding">RETAKE QUIZ →</Link><ProfileManager profileId={profile.id} name={profile.name} />
  </div>;
}
