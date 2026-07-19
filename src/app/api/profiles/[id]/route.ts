import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { profiles, tastingNotes } from "@/db/schema";
import { findHouseholdProfile, listProfiles } from "@/server/profiles";
import { ACTIVE_PROFILE_COOKIE, getHouseholdSession } from "@/server/session";

const renameSchema = z.object({ name: z.string().trim().min(1).max(24) });
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const profile = findHouseholdProfile(session.user.id, id);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid name" }, { status: 400 });
  const duplicate = listProfiles(session.user.id).some((candidate) =>
    candidate.id !== id && candidate.name.toLocaleLowerCase() === parsed.data.name.toLocaleLowerCase());
  if (duplicate) return NextResponse.json({ error: "That profile name is already in use." }, { status: 409 });
  db.update(profiles).set({ name: parsed.data.name }).where(and(
    eq(profiles.id, id), eq(profiles.householdId, session.user.id),
  )).run();
  return NextResponse.json({ profile: findHouseholdProfile(session.user.id, id) });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const profile = findHouseholdProfile(session.user.id, id);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  if (listProfiles(session.user.id).length === 1) {
    return NextResponse.json({ error: "The last profile cannot be deleted." }, { status: 409 });
  }
  const hasNotes = db.select({ id: tastingNotes.id }).from(tastingNotes).where(and(
    eq(tastingNotes.householdId, session.user.id), eq(tastingNotes.profileId, id),
  )).get();
  if (hasNotes) return NextResponse.json({ error: "Profiles with tasting notes cannot be deleted; rename this profile instead." }, { status: 409 });
  db.delete(profiles).where(and(eq(profiles.id, id), eq(profiles.householdId, session.user.id))).run();
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(ACTIVE_PROFILE_COOKIE);
  return response;
}
