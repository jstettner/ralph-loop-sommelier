import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { auth } from "@/lib/auth";

export const ACTIVE_PROFILE_COOKIE = "wine-trainer-active-profile";

export async function getHouseholdSession(requestHeaders?: Headers) {
  return auth.api.getSession({ headers: requestHeaders ?? await headers() });
}

export type HouseholdSession = NonNullable<Awaited<ReturnType<typeof getHouseholdSession>>>;

export function activeCookieValue(sessionId: string, profileId: string): string {
  return `${sessionId}:${profileId}`;
}

export function activeProfileCookieOptions(session: HouseholdSession) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").startsWith("https://"),
    path: "/",
    expires: session.session.expiresAt,
  };
}

export async function getActiveProfile(session: HouseholdSession) {
  const store = await cookies();
  const raw = store.get(ACTIVE_PROFILE_COOKIE)?.value;
  const prefix = `${session.session.id}:`;
  if (!raw?.startsWith(prefix)) return null;
  const profileId = raw.slice(prefix.length);
  return db.select().from(profiles).where(and(
    eq(profiles.id, profileId),
    eq(profiles.householdId, session.user.id),
  )).get() ?? null;
}
