import { and, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteNoteButton } from "@/components/delete-note-button";
import { db } from "@/db/client";
import { profiles, tastingNotes, wines } from "@/db/schema";
import { getHouseholdSession } from "@/server/session";

function scale(value: number | null): string { return value ? "▮".repeat(value) + "▯".repeat(5 - value) : "-----"; }

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const session = await getHouseholdSession();
  if (!session) return null;
  const { noteId } = await params;
  const row = db.select({ note: tastingNotes, wine: wines, profile: profiles }).from(tastingNotes)
    .innerJoin(wines, eq(tastingNotes.wineId, wines.id)).innerJoin(profiles, eq(tastingNotes.profileId, profiles.id))
    .where(and(eq(tastingNotes.id, noteId), eq(tastingNotes.householdId, session.user.id))).get();
  if (!row) notFound();
  const companions = db.select({ id: tastingNotes.id, profile: profiles }).from(tastingNotes).innerJoin(profiles, eq(tastingNotes.profileId, profiles.id)).where(and(eq(tastingNotes.householdId, session.user.id), eq(tastingNotes.wineId, row.wine.id), ne(tastingNotes.id, noteId))).all();
  const dimensions = ["sweetness", "acidity", "tannin", "alcohol", "body"] as const;
  return <article className="mx-auto max-w-3xl space-y-9"><header><Link href="/journal">← JOURNAL</Link><h1 className="mt-5 text-2xl">{row.wine.producer ? `${row.wine.producer} ` : ""}{row.wine.name} {row.wine.vintage}</h1><p className={`bloom-${row.profile.color} mt-2`} style={{ color: `var(--${row.profile.color})` }}>Tasted by {row.profile.name}</p></header>
    <section className="grid gap-6 sm:grid-cols-2"><div><h2 className="text-sm text-[var(--text-dim)]">APPEARANCE</h2><p>{row.note.appearance ?? "--"}</p></div><div><h2 className="text-sm text-[var(--text-dim)]">NOSE</h2><p>{row.note.nose.join(" · ") || "--"}</p></div></section>
    <section><h2 className="mb-4">── PALATE ──</h2><div className="grid grid-cols-2 gap-5 sm:grid-cols-3">{dimensions.map((dimension) => <div key={dimension}><p className="text-xs text-[var(--text-dim)]">{dimension.toUpperCase()}</p><p className="text-[var(--amber)]">{scale(row.note.palate[dimension])}</p></div>)}</div><p className="mt-5">FLAVORS: {row.note.palate.flavors.join(" · ") || "--"}</p></section>
    <section className="grid gap-5 sm:grid-cols-3"><p>FINISH<br />{row.note.finish ?? "--"}</p><p>RATING<br /><span className="text-[var(--amber)]">{scale(row.note.rating)}</span></p><p>VERDICT<br /><span className={`verdict-${row.note.verdict}`}>{row.note.verdict}</span></p></section>
    {row.note.freeform && <section><h2 className="text-sm text-[var(--text-dim)]">IN THEIR WORDS</h2><p>{row.note.freeform}</p></section>}
    {row.note.conversationId && <Link href={`/chat/${row.note.conversationId}`}>VIEW SOURCE CONVERSATION →</Link>}
    {companions.length > 0 && <section><h2 className="mb-3">ALSO TASTED THIS</h2>{companions.map((companion) => <Link className={`mr-4 bloom-${companion.profile.color}`} style={{ color: `var(--${companion.profile.color})` }} href={`/journal/${companion.id}`} key={companion.id}>{companion.profile.name}</Link>)}</section>}
    <DeleteNoteButton noteId={row.note.id} />
  </article>;
}
