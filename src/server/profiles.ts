import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";

export const PROFILE_COLORS = ["cyan", "magenta", "amber", "green"] as const;

export function listProfiles(householdId: string) {
  return db.select().from(profiles).where(eq(profiles.householdId, householdId)).orderBy(asc(profiles.createdAt)).all();
}

export function findHouseholdProfile(householdId: string, profileId: string) {
  return db.select().from(profiles).where(and(
    eq(profiles.householdId, householdId),
    eq(profiles.id, profileId),
  )).get() ?? null;
}
