import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { palateProfiles } from "@/db/schema";
import { derivePalateDimensions, quizAnswersSchema } from "@/lib/palate";
import { getActiveProfile, getHouseholdSession } from "@/server/session";

export async function PUT(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getActiveProfile(session);
  if (!profile) return NextResponse.json({ error: "Active profile required." }, { status: 409 });
  const parsed = quizAnswersSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete every quiz question." }, { status: 400 });
  const dimensions = derivePalateDimensions(parsed.data);
  db.update(palateProfiles).set({
    quizAnswers: parsed.data,
    sweetness: dimensions.sweetness,
    acidity: dimensions.acidity,
    tannin: dimensions.tannin,
    body: dimensions.body,
    oak: dimensions.oak,
    adventurousness: dimensions.adventurousness,
    notes: dimensions.notes,
    updatedAt: new Date(),
  }).where(eq(palateProfiles.profileId, profile.id)).run();
  return NextResponse.json({ palate: dimensions });
}

export async function DELETE(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getActiveProfile(session);
  if (!profile) return NextResponse.json({ error: "Active profile required." }, { status: 409 });
  db.update(palateProfiles).set({
    quizAnswers: null, sweetness: null, acidity: null, tannin: null, body: null,
    oak: null, adventurousness: null, updatedAt: new Date(),
  }).where(eq(palateProfiles.profileId, profile.id)).run();
  return new NextResponse(null, { status: 204 });
}
