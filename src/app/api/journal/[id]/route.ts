import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { profiles, tastingNotes, wines } from "@/db/schema";
import { getHouseholdSession } from "@/server/session";

type Context = { params: Promise<{ id: string }> };

function findNote(householdId: string, id: string) {
  return db.select({ note: tastingNotes, wine: wines, profile: profiles }).from(tastingNotes)
    .innerJoin(wines, eq(tastingNotes.wineId, wines.id)).innerJoin(profiles, eq(tastingNotes.profileId, profiles.id))
    .where(and(eq(tastingNotes.id, id), eq(tastingNotes.householdId, householdId))).get();
}

export async function GET(request: Request, context: Context) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const row = findNote(session.user.id, id);
  if (!row) return NextResponse.json({ error: "Tasting note not found." }, { status: 404 });
  const companions = db.select({ noteId: tastingNotes.id, profileName: profiles.name, profileColor: profiles.color }).from(tastingNotes)
    .innerJoin(profiles, eq(tastingNotes.profileId, profiles.id)).where(and(
      eq(tastingNotes.householdId, session.user.id), eq(tastingNotes.wineId, row.note.wineId), ne(tastingNotes.id, id),
    )).all();
  return NextResponse.json({ ...row, companions });
}

export async function DELETE(request: Request, context: Context) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!findNote(session.user.id, id)) return NextResponse.json({ error: "Tasting note not found." }, { status: 404 });
  db.delete(tastingNotes).where(and(eq(tastingNotes.id, id), eq(tastingNotes.householdId, session.user.id))).run();
  return new NextResponse(null, { status: 204 });
}
