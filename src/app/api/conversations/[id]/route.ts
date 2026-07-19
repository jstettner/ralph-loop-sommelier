import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { chatRuns, conversations, messages, profiles } from "@/db/schema";
import { recentRun } from "@/server/chat-runs";
import { getHouseholdSession } from "@/server/session";

const titleSchema = z.object({ title: z.string().trim().min(1).max(60) }).strict();
type Context = { params: Promise<{ id: string }> };

function owned(id: string, householdId: string) {
  return db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.householdId, householdId))).get();
}

export async function GET(request: Request, context: Context) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const conversation = owned(id, session.user.id);
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const history = db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt), asc(messages.id)).all();
  const householdProfiles = db.select().from(profiles).where(eq(profiles.householdId, session.user.id)).all();
  return NextResponse.json({ conversation, messages: history, participants: householdProfiles.filter((profile) => conversation.participantIds.includes(profile.id)), run: recentRun(id, session.user.id) ?? null });
}

export async function PATCH(request: Request, context: Context) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!owned(id, session.user.id)) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const parsed = titleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Title must be 1–60 characters." }, { status: 400 });
  db.update(conversations).set({ title: parsed.data.title }).where(eq(conversations.id, id)).run();
  return NextResponse.json({ conversation: owned(id, session.user.id) });
}

export async function DELETE(request: Request, context: Context) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!owned(id, session.user.id)) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  recentRun(id, session.user.id);
  const active = db.select({ id: chatRuns.id }).from(chatRuns).where(and(eq(chatRuns.conversationId, id), eq(chatRuns.status, "running"))).get();
  if (active) return NextResponse.json({ error: "Wait for the active response before deleting this chat." }, { status: 409 });
  db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.householdId, session.user.id))).run();
  return new Response(null, { status: 204 });
}
