import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { grapes, palateProfiles, profiles, tastingNotes, wines } from "@/db/schema";

export type MemoryTasting = {
  wine: string;
  verdict: "liked" | "mixed" | "disliked";
  rating: number | null;
  nose: string[];
  flavors: string[];
};

export type MemoryParticipant = {
  id: string;
  name: string;
  dimensions: Record<string, number | null>;
  notes: string;
  quizAnswers: Record<string, unknown> | null;
  tastings: MemoryTasting[];
};

export type CurriculumMemory = { name: string; profile: string };

// Dynamic, per-profile context. Changes as tasters record notes, so it lives AFTER the
// stable cache breakpoint in the assembled prompt (specs/03).
export function assembleParticipantMemory(participants: MemoryParticipant[]): string {
  const participantSections = participants.map((participant) => {
    const knownDimensions = Object.entries(participant.dimensions).filter((entry): entry is [string, number] => entry[1] !== null);
    const liked = participant.tastings.filter((note) => note.verdict === "liked").map((note) => note.wine);
    const disliked = participant.tastings.filter((note) => note.verdict === "disliked").map((note) => note.wine);
    const lines = [
      `PARTICIPANT ${participant.id} | ${participant.name}`,
      knownDimensions.length ? `Dimensions: ${knownDimensions.map(([name, value]) => `${name}=${value}/5`).join(", ")}` : "Dimensions: unknown",
    ];
    if (participant.notes.trim()) lines.push(`Palate notes: ${participant.notes.trim()}`);
    if (participant.quizAnswers && Object.keys(participant.quizAnswers).length) lines.push(`Quiz summary: ${JSON.stringify(participant.quizAnswers)}`);
    if (participant.tastings.length) lines.push(`Recent tastings:\n${participant.tastings.map((note) =>
      `- ${note.wine}: ${note.verdict}${note.rating ? `, ${note.rating}/5` : ""}; descriptors ${[...note.nose, ...note.flavors].join(", ") || "none recorded"}`).join("\n")}`);
    if (liked.length) lines.push(`Liked wines: ${liked.join(", ")}`);
    if (disliked.length) lines.push(`Disliked wines: ${disliked.join(", ")}`);
    return lines.join("\n");
  });
  return [`TASTER MEMORY`, participantSections.join("\n\n")].filter(Boolean).join("\n\n");
}

// Stable, seed-derived curriculum. Identical across households, so it can anchor the
// cached system prefix (specs/03).
export function assembleCurriculum(curriculum: CurriculumMemory[]): string {
  const curriculumLines = curriculum.map((grape) => `- ${grape.name}: ${grape.profile.split(/(?<=[.!?])\s/)[0] ?? grape.profile}`);
  return [`CURRICULUM`, curriculumLines.join("\n")].filter(Boolean).join("\n\n");
}

export function assembleMemory(participants: MemoryParticipant[], curriculum: CurriculumMemory[]): string {
  return [assembleParticipantMemory(participants), assembleCurriculum(curriculum)].filter(Boolean).join("\n\n");
}

export interface MemoryContext {
  /** Dynamic per-profile memory — lives after the ephemeral cache breakpoint. */
  participantMemory: string;
  /** Seeded curriculum — part of the stable, cacheable system prefix. */
  curriculum: string;
}

export function loadMemoryContext(householdId: string, participantIds: string[]): MemoryContext {
  const participantMemory = participantIds.flatMap((profileId): MemoryParticipant[] => {
    const profile = db.select().from(profiles).where(and(eq(profiles.id, profileId), eq(profiles.householdId, householdId))).get();
    if (!profile) return [];
    const palate = db.select().from(palateProfiles).where(eq(palateProfiles.profileId, profileId)).get();
    const rows = db.select({ note: tastingNotes, wine: wines }).from(tastingNotes)
      .innerJoin(wines, eq(tastingNotes.wineId, wines.id))
      .where(and(eq(tastingNotes.householdId, householdId), eq(tastingNotes.profileId, profileId)))
      .orderBy(desc(tastingNotes.createdAt)).limit(10).all();
    return [{
      id: profile.id, name: profile.name,
      dimensions: {
        sweetness: palate?.sweetness ?? null, acidity: palate?.acidity ?? null, tannin: palate?.tannin ?? null,
        body: palate?.body ?? null, oak: palate?.oak ?? null, adventurousness: palate?.adventurousness ?? null,
      },
      notes: palate?.notes ?? "", quizAnswers: palate?.quizAnswers ?? null,
      tastings: rows.map(({ note, wine }) => ({ wine: wine.name, verdict: note.verdict, rating: note.rating, nose: note.nose, flavors: note.palate.flavors })),
    }];
  });
  const curriculum = db.select({ name: grapes.name, profile: grapes.profile }).from(grapes).orderBy(grapes.orderIndex).all();
  return { participantMemory: assembleParticipantMemory(participantMemory), curriculum: assembleCurriculum(curriculum) };
}
