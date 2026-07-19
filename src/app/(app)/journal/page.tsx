import Link from "next/link";
import { JournalFilters } from "@/components/journal-filters";
import { groupJournal, listJournal, type JournalFilters as FilterValues } from "@/server/journal";
import { listProfiles } from "@/server/profiles";
import { getHouseholdSession } from "@/server/session";

function rating(value: number | null): string { return value ? "▮".repeat(value) + "▯".repeat(5 - value) : "-----"; }

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ taster?: string; verdict?: string; style?: string }> }) {
  const session = await getHouseholdSession();
  if (!session) return null;
  const raw = await searchParams;
  const filters: FilterValues = {
    profileId: raw.taster,
    verdict: ["liked", "mixed", "disliked"].includes(raw.verdict ?? "") ? raw.verdict as FilterValues["verdict"] : undefined,
    style: ["red", "white", "rose", "sparkling", "dessert", "fortified", "orange"].includes(raw.style ?? "") ? raw.style as FilterValues["style"] : undefined,
  };
  const groups = groupJournal(listJournal(session.user.id, filters));
  return <div className="mx-auto max-w-5xl space-y-8">
    <header><p className="text-sm text-[var(--text-dim)]">somm@cellar:~$ journal --household</p><h1 className="bloom-cyan mt-2 text-2xl text-[var(--cyan)]">── TASTING JOURNAL ──</h1></header>
    <JournalFilters profiles={listProfiles(session.user.id)} values={{ taster: raw.taster, verdict: raw.verdict, style: raw.style }} />
    {groups.length === 0 ? <p className="border border-[var(--border)] p-8 text-[var(--text-dim)]">No tasting notes match. <Link href="/chat">Start a tasting in chat.</Link></p>
      : <div className="space-y-5">{groups.map((group) => {
        const first = group[0]; if (!first) return null;
        return <article className="border border-[var(--border)] bg-[var(--bg-raised)] p-5" key={`${first.note.conversationId}-${first.note.wineId}-${first.note.id}`} data-testid="journal-card">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="text-lg text-[var(--text)] no-underline" href={`/journal/${first.note.id}`}>{first.wine.producer ? `${first.wine.producer} ` : ""}{first.wine.name}{first.wine.vintage ? ` ${first.wine.vintage}` : ""}</Link><p className="mt-1 text-sm uppercase text-[var(--text-dim)]">{first.wine.style}</p></div><span className={`verdict-${first.note.verdict} border px-2 py-1 text-xs uppercase`}>{first.note.verdict}</span></div>
          <div className={`mt-5 grid gap-3 ${group.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{group.map((row) => <div className="min-w-0 border-t border-[var(--border)] pt-3" key={row.note.id}><p className={`bloom-${row.profile.color} truncate`} style={{ color: `var(--${row.profile.color})` }}>{row.profile.name}</p><p className="mt-1 text-[var(--amber)]" aria-label={`${row.note.rating ?? 0} out of 5`}>{rating(row.note.rating)}</p><p className="mt-2 truncate text-sm text-[var(--text-dim)]">{row.note.nose.slice(0, 3).join(" · ")}</p></div>)}</div>
        </article>;
      })}</div>}
  </div>;
}
