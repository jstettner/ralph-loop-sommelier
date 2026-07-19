import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, tastingNotes, wines } from "@/db/schema";

export type JournalFilters = {
  profileId?: string;
  verdict?: "liked" | "mixed" | "disliked";
  style?: "red" | "white" | "rose" | "sparkling" | "dessert" | "fortified" | "orange";
};

export function listJournal(householdId: string, filters: JournalFilters = {}) {
  const conditions: SQL[] = [eq(tastingNotes.householdId, householdId)];
  if (filters.profileId) conditions.push(eq(tastingNotes.profileId, filters.profileId));
  if (filters.verdict) conditions.push(eq(tastingNotes.verdict, filters.verdict));
  if (filters.style) conditions.push(eq(wines.style, filters.style));
  return db.select({ note: tastingNotes, wine: wines, profile: profiles }).from(tastingNotes)
    .innerJoin(wines, eq(tastingNotes.wineId, wines.id))
    .innerJoin(profiles, eq(tastingNotes.profileId, profiles.id))
    .where(and(...conditions)).orderBy(desc(tastingNotes.createdAt)).all();
}

export type JournalRow = ReturnType<typeof listJournal>[number];

export function groupJournal(rows: JournalRow[]): JournalRow[][] {
  const groups = new Map<string, JournalRow[]>();
  for (const row of rows) {
    const key = row.note.conversationId ? `${row.note.conversationId}:${row.note.wineId}` : row.note.id;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}
