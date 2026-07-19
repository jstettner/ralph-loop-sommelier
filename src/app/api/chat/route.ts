import { and, eq } from "drizzle-orm";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { conversations, messages, type MessagePart } from "@/db/schema";
import { recordCacheMetrics } from "@/lib/llm/diagnostics";
import { getModel, getModelCapabilities, ModelUnavailableError } from "@/lib/llm/registry";
import { applyLatestCacheBreakpoint, buildChatRequest } from "@/lib/llm/request";
import { createChatTools } from "@/lib/llm/tools";
import { loadMemoryContext } from "@/server/memory";
import { getHouseholdSession } from "@/server/session";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(z.object({ id: z.string().min(1), role: z.enum(["user", "assistant"]), parts: z.array(z.object({ type: z.string() }).passthrough()) })),
});

function persistParts(parts: UIMessage["parts"]): MessagePart[] {
  return JSON.parse(JSON.stringify(parts)) as MessagePart[];
}

export async function POST(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
  const conversation = db.select().from(conversations).where(and(
    eq(conversations.id, parsed.data.conversationId), eq(conversations.householdId, session.user.id),
  )).get();
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  let model;
  try { model = getModel(conversation.model); } catch (error) {
    if (error instanceof ModelUnavailableError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const uiMessages = parsed.data.messages as UIMessage[];
  const latest = [...uiMessages].reverse().find((message) => message.role === "user");
  if (!latest) return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  const alreadyStored = db.select({ id: messages.id }).from(messages).where(eq(messages.id, latest.id)).get();
  if (!alreadyStored) {
    db.insert(messages).values({ id: latest.id, conversationId: conversation.id, role: "user", parts: persistParts(latest.parts) }).run();
    if (conversation.title === "New tasting session") {
      const text = latest.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join(" ").trim();
      db.update(conversations).set({ title: text.slice(0, 60) || conversation.title, updatedAt: new Date() }).where(eq(conversations.id, conversation.id)).run();
    }
  }
  const memory = loadMemoryContext(session.user.id, conversation.participantIds);
  const capabilities = getModelCapabilities(conversation.model);
  const assembled = buildChatRequest({
    capabilities,
    participantMemory: memory.participantMemory,
    curriculum: memory.curriculum,
    shared: conversation.participantIds.length > 1,
    modelMessages: await convertToModelMessages(uiMessages),
  });
  const result = streamText({
    model,
    tools: createChatTools({ conversationId: conversation.id, householdId: session.user.id, participantIds: conversation.participantIds }),
    stopWhen: stepCountIs(2),
    onFinish: ({ providerMetadata }) => recordCacheMetrics(conversation.model, providerMetadata),
    system: assembled.system,
    messages: assembled.messages,
    providerOptions: assembled.providerOptions,
    allowSystemInMessages: assembled.allowSystemInMessages,
    prepareStep: assembled.cacheBreakpoints
      ? ({ messages: stepMessages }) => ({ messages: applyLatestCacheBreakpoint(stepMessages, capabilities) })
      : undefined,
  });
  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    sendReasoning: true,
    sendSources: true,
    generateMessageId: () => crypto.randomUUID(),
    onFinish: ({ responseMessage, isAborted }) => {
      if (!isAborted) {
        db.insert(messages).values({ id: responseMessage.id, conversationId: conversation.id, role: "assistant", parts: persistParts(responseMessage.parts) }).onConflictDoNothing().run();
        db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id)).run();
      }
    },
  });
}
