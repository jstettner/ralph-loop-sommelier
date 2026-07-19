import type { UIMessage } from "ai";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChatClient } from "@/components/chat-client";
import { db } from "@/db/client";
import { conversations, messages, profiles } from "@/db/schema";
import { getHouseholdSession } from "@/server/session";

export default async function ConversationPage({ params, searchParams }: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ starter?: string }>;
}) {
  const session = await getHouseholdSession();
  if (!session) return null;
  const { conversationId } = await params;
  const conversation = db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.householdId, session.user.id))).get();
  if (!conversation) notFound();
  const stored = db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(asc(messages.createdAt)).all();
  const householdProfiles = db.select().from(profiles).where(eq(profiles.householdId, session.user.id)).all();
  const participants = householdProfiles.filter((profile) => conversation.participantIds.includes(profile.id));
  const initialMessages = stored.map((message) => ({ id: message.id, role: message.role, parts: message.parts })) as unknown as UIMessage[];
  const { starter } = await searchParams;
  return <ChatClient conversationId={conversation.id} initialMessages={initialMessages} participants={participants} model={conversation.model} starter={stored.length ? undefined : starter} />;
}
