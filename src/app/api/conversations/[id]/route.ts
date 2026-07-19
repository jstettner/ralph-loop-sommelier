import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { conversations, messages, profiles } from "@/db/schema";
import { getHouseholdSession } from "@/server/session";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const conversation = db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.householdId, session.user.id))).get();
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const history = db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt)).all();
  const householdProfiles = db.select().from(profiles).where(eq(profiles.householdId, session.user.id)).all();
  return NextResponse.json({ conversation, messages: history, participants: householdProfiles.filter((profile) => conversation.participantIds.includes(profile.id)) });
}
