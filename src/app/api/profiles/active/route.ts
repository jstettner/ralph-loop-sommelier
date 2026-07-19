import { NextResponse } from "next/server";
import { z } from "zod";
import { findHouseholdProfile } from "@/server/profiles";
import { ACTIVE_PROFILE_COOKIE, activeCookieValue, activeProfileCookieOptions, getHouseholdSession } from "@/server/session";

const selectionSchema = z.object({ profileId: z.string().uuid() });

export async function POST(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile." }, { status: 400 });
  const profile = findHouseholdProfile(session.user.id, parsed.data.profileId);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  const response = NextResponse.json({ profile });
  response.cookies.set(ACTIVE_PROFILE_COOKIE, activeCookieValue(session.session.id, profile.id), activeProfileCookieOptions(session));
  return response;
}
