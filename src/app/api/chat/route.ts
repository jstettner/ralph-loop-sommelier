import { and, asc, eq } from "drizzle-orm";
import { convertToModelMessages, createUIMessageStreamResponse, generateText, readUIMessageStream, stepCountIs, streamText, type Tool, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { chatRuns, conversations, messages, type MessagePart } from "@/db/schema";
import { recordCacheMetrics } from "@/lib/llm/diagnostics";
import { getModel, getModelCapabilities, ModelUnavailableError, nativeSearchTool } from "@/lib/llm/registry";
import { applyLatestCacheBreakpoint, buildChatRequest, nativeWebSearchEnabled, resolveChatTooling } from "@/lib/llm/request";
import { createChatTools } from "@/lib/llm/tools";
import { loadMemoryContext } from "@/server/memory";
import { recoverStaleRuns } from "@/server/chat-runs";
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
  const uiMessages = parsed.data.messages as UIMessage[];
  const latest = [...uiMessages].reverse().find((message) => message.role === "user");
  if (!latest) return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  recoverStaleRuns(conversation.id, session.user.id);
  const priorRun = db.select().from(chatRuns).where(eq(chatRuns.userMessageId, latest.id)).get();
  if (priorRun) {
    if (priorRun.householdId !== session.user.id || priorRun.conversationId !== conversation.id) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    return NextResponse.json({ run: priorRun }, { status: priorRun.status === "running" ? 202 : 200 });
  }
  const active = db.select().from(chatRuns).where(and(eq(chatRuns.conversationId, conversation.id), eq(chatRuns.status, "running"))).get();
  if (active) return NextResponse.json({ error: "A response is already being generated.", run: active }, { status: 409 });
  let model;
  try { model = getModel(conversation.model); } catch (error) {
    if (error instanceof ModelUnavailableError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const assistantMessageId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(messages).values({ id: latest.id, conversationId: conversation.id, role: "user", parts: persistParts(latest.parts), createdAt: now }).run();
    tx.insert(messages).values({ id: assistantMessageId, conversationId: conversation.id, role: "assistant", parts: [], createdAt: new Date(now.getTime() + 1) }).run();
    tx.insert(chatRuns).values({ id: runId, householdId: session.user.id, conversationId: conversation.id, userMessageId: latest.id, assistantMessageId, status: "running", startedAt: now, heartbeatAt: now, updatedAt: now }).run();
    const text = latest.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join(" ").trim();
    tx.update(conversations).set({
      ...(conversation.title === "New tasting session" ? { title: text.slice(0, 60) || conversation.title } : {}), updatedAt: now,
    }).where(eq(conversations.id, conversation.id)).run();
  });
  const stored = db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(asc(messages.createdAt)).all();
  const canonicalMessages = stored.filter((message) => message.id !== assistantMessageId)
    .map((message) => ({ id: message.id, role: message.role, parts: message.parts })) as UIMessage[];
  const memory = loadMemoryContext(session.user.id, conversation.participantIds);
  const capabilities = getModelCapabilities(conversation.model);
  // Function tools are ALWAYS present. Native provider search is added alongside them when the
  // exact model supports combining both; otherwise a bounded native pass gathers sources first
  // and the main generation keeps every function tool (specs/03, specs/08).
  const tooling = resolveChatTooling(capabilities, nativeWebSearchEnabled());
  const assembled = buildChatRequest({
    capabilities,
    participantMemory: memory.participantMemory,
    curriculum: memory.curriculum,
    shared: conversation.participantIds.length > 1,
    modelMessages: await convertToModelMessages(canonicalMessages),
    nativeSearchActive: tooling.nativeSearch !== null,
  });
  const functionTools = createChatTools({ conversationId: conversation.id, householdId: session.user.id, participantIds: conversation.participantIds });
  const tools: Record<string, Tool> = { ...functionTools };
  let system = assembled.system;
  if (tooling.nativeSearch && !tooling.twoPass) {
    const native = nativeSearchTool(capabilities);
    if (native) tools.web_search = native;
  } else if (tooling.nativeSearch && tooling.twoPass) {
    const native = nativeSearchTool(capabilities);
    if (native) {
      try {
        const pass = await generateText({
          model, tools: { web_search: native },
          system: assembled.system, messages: assembled.messages,
          providerOptions: assembled.providerOptions, allowSystemInMessages: assembled.allowSystemInMessages,
        });
        const lines = pass.sources.flatMap((source) => "url" in source && source.url
          ? [`- ${("title" in source && source.title) || source.url}: ${source.url}`] : []);
        if (lines.length) system = `${assembled.system ?? ""}\n\nLive web search results you may cite:\n${lines.join("\n")}`.trim();
      } catch { /* native search unavailable — proceed with function tools and fallback search */ }
    }
  }
  let result;
  try { result = streamText({
    model,
    tools,
    stopWhen: stepCountIs(3),
    onFinish: ({ providerMetadata }) => recordCacheMetrics(conversation.model, providerMetadata),
    system,
    messages: assembled.messages,
    providerOptions: assembled.providerOptions,
    allowSystemInMessages: assembled.allowSystemInMessages,
    prepareStep: assembled.cacheBreakpoints
      ? ({ messages: stepMessages }) => ({ messages: applyLatestCacheBreakpoint(stepMessages, capabilities) })
      : undefined,
  }); } catch {
    const failedAt = new Date();
    db.update(chatRuns).set({ status: "failed", safeError: "The response could not be generated. Please try again.", finishedAt: failedAt, updatedAt: failedAt }).where(eq(chatRuns.id, runId)).run();
    return NextResponse.json({ error: "The response could not be generated. Please try again." }, { status: 500 });
  }
  let streamFailed = false;
  const uiStream = result.toUIMessageStream({
    originalMessages: canonicalMessages,
    sendReasoning: true,
    sendSources: true,
    generateMessageId: () => assistantMessageId,
    onError: () => { streamFailed = true; return "The response could not be generated. Please try again."; },
  });
  const [clientStream, persistenceStream] = uiStream.tee();
  let lastParts: MessagePart[] = [];
  let lastCheckpoint = 0;
  const heartbeat = setInterval(() => {
    const at = new Date();
    db.update(chatRuns).set({ heartbeatAt: at, updatedAt: at }).where(and(eq(chatRuns.id, runId), eq(chatRuns.status, "running"))).run();
  }, 15_000);
  const persistence = (async () => {
    try {
      for await (const partial of readUIMessageStream({ stream: persistenceStream, terminateOnError: true })) {
        lastParts = persistParts(partial.parts);
        const time = Date.now();
        if (time - lastCheckpoint >= 250) {
          db.update(messages).set({ parts: lastParts }).where(eq(messages.id, assistantMessageId)).run();
          lastCheckpoint = time;
        }
      }
      const finishedAt = new Date();
      db.transaction((tx) => {
        tx.update(messages).set({ parts: lastParts }).where(eq(messages.id, assistantMessageId)).run();
        tx.update(chatRuns).set(streamFailed
          ? { status: "failed", safeError: "The response could not be generated. Please try again.", finishedAt, heartbeatAt: finishedAt, updatedAt: finishedAt }
          : { status: "completed", safeError: null, finishedAt, heartbeatAt: finishedAt, updatedAt: finishedAt }
        ).where(and(eq(chatRuns.id, runId), eq(chatRuns.status, "running"))).run();
        tx.update(conversations).set({ updatedAt: finishedAt }).where(eq(conversations.id, conversation.id)).run();
      });
    } catch {
      const failedAt = new Date();
      db.update(messages).set({ parts: lastParts }).where(eq(messages.id, assistantMessageId)).run();
      db.update(chatRuns).set({ status: "failed", safeError: "The response could not be generated. Please try again.", finishedAt: failedAt, heartbeatAt: failedAt, updatedAt: failedAt }).where(and(eq(chatRuns.id, runId), eq(chatRuns.status, "running"))).run();
    } finally { clearInterval(heartbeat); }
  })();
  void persistence;
  return createUIMessageStreamResponse({ stream: clientStream, headers: { "x-chat-run-id": runId } });
}
