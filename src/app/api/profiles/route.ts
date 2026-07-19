import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { palateProfiles, profiles } from "@/db/schema";
import { PROFILE_COLORS, listProfiles } from "@/server/profiles";
import { ACTIVE_PROFILE_COOKIE, activeCookieValue, activeProfileCookieOptions, getHouseholdSession } from "@/server/session";

const createProfileSchema = z.object({ name: z.string().trim().min(1).max(24) });

export async function GET(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ profiles: listProfiles(session.user.id) });
}

export async function POST(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid name" }, { status: 400 });

  const existing = listProfiles(session.user.id);
  if (existing.length >= 4) return NextResponse.json({ error: "A household can have at most 4 profiles." }, { status: 409 });
  if (existing.some((profile) => profile.name.toLocaleLowerCase() === parsed.data.name.toLocaleLowerCase())) {
    return NextResponse.json({ error: "That profile name is already in use." }, { status: 409 });
  }
  const color = PROFILE_COLORS.find((candidate) => !existing.some((profile) => profile.color === candidate));
  if (!color) return NextResponse.json({ error: "No profile color is available." }, { status: 409 });

  const profile = db.transaction((tx) => {
    const created = {
      id: crypto.randomUUID(), householdId: session.user.id,
      name: parsed.data.name, color,
    };
    tx.insert(profiles).values(created).run();
    tx.insert(palateProfiles).values({ id: crypto.randomUUID(), profileId: created.id }).run();
    return tx.select().from(profiles).where(eq(profiles.id, created.id)).get();
  });
  if (!profile) return NextResponse.json({ error: "Profile creation failed." }, { status: 500 });
  const response = NextResponse.json({ profile }, { status: 201 });
  response.cookies.set(ACTIVE_PROFILE_COOKIE, activeCookieValue(session.session.id, profile.id), activeProfileCookieOptions(session));
  return response;
}
