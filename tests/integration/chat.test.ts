import { and, eq } from "drizzle-orm";
import { streamText, stepCountIs } from "ai";
import type { LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV2, simulateReadableStream } from "ai/test";
import { afterAll, describe, expect, it } from "vitest";
import { POST as postChat } from "../../src/app/api/chat/route";
import { GET as listConversations, POST as createConversation } from "../../src/app/api/conversations/route";
import { DELETE as deleteConversation, GET as getConversation, PATCH as renameConversation } from "../../src/app/api/conversations/[id]/route";
import { GET as listJournal } from "../../src/app/api/journal/route";
import { DELETE as deleteJournalNote } from "../../src/app/api/journal/[id]/route";
import { GET as getRecommendations } from "../../src/app/api/recommendations/route";
import { PATCH as patchRecommendation } from "../../src/app/api/recommendations/[id]/route";
import { POST as createProfile } from "../../src/app/api/profiles/route";
import { db } from "../../src/db/client";
import { chatRuns, conversations, messages, palateProfiles, recommendations, tastingNotes, user, wines } from "../../src/db/schema";
import { auth } from "../../src/lib/auth";
import { MOCK_SCRIPTS } from "../../src/lib/llm/mock";
import { createChatTools } from "../../src/lib/llm/tools";
import { loadMemoryContext } from "../../src/server/memory";

type Fixture = { householdId: string; cookie: string; profileIds: string[]; conversationId: string };
const householdIds: string[] = [];

async function signUp(label: string) {
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email: `${label}-${crypto.randomUUID()}@example.test`, password: "correct-horse", name: label }),
  }));
  const payload = await response.json() as { user: { id: string } };
  householdIds.push(payload.user.id);
  const raw = response.headers.get("set-cookie") ?? "";
  const match = raw.match(/(?:^|,\s*)([^=;,]*session[^=;,]*)=([^;]+)/i);
  if (!match) throw new Error("Signup did not create a session cookie.");
  return { householdId: payload.user.id, cookie: `${match[1]}=${match[2]}` };
}

async function makeFixture(label: string, names = ["Alex", "Sam"]): Promise<Fixture> {
  const household = await signUp(label);
  const profileIds: string[] = [];
  for (const name of names) {
    const response = await createProfile(new Request("http://localhost:3000/api/profiles", {
      method: "POST", headers: { cookie: household.cookie, "content-type": "application/json" }, body: JSON.stringify({ name }),
    }));
    const payload = await response.json() as { profile: { id: string } };
    profileIds.push(payload.profile.id);
  }
  const response = await createConversation(new Request("http://localhost:3000/api/conversations", {
    method: "POST", headers: { cookie: household.cookie, "content-type": "application/json" },
    body: JSON.stringify({ participantIds: profileIds, model: "mock:mock-model" }),
  }));
  const payload = await response.json() as { conversation: { id: string } };
  return { ...household, profileIds, conversationId: payload.conversation.id };
}

async function send(fixture: Fixture, text: string): Promise<string> {
  const response = await postChat(new Request("http://localhost:3000/api/chat", {
    method: "POST", headers: { cookie: fixture.cookie, "content-type": "application/json" },
    body: JSON.stringify({ conversationId: fixture.conversationId, messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] }] }),
  }));
  expect(response.status).toBe(200);
  return response.text();
}

async function waitFor(check: () => boolean, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for fixture state.");
}

function streamedText(stream: string): string {
  return stream.split("\n").flatMap((line) => {
    if (!line.startsWith("data: {") || line === "data: [DONE]") return [];
    const event = JSON.parse(line.slice(6)) as { type?: unknown; delta?: unknown };
    return event.type === "text-delta" && typeof event.delta === "string" ? [event.delta] : [];
  }).join("");
}

function streamedParts(stream: string): { order: string[]; reasoning: string; text: string } {
  const order: string[] = [];
  let reasoning = "";
  let text = "";
  for (const line of stream.split("\n")) {
    if (!line.startsWith("data: {") || line === "data: [DONE]") continue;
    const event = JSON.parse(line.slice(6)) as { type?: string; delta?: string };
    if (event.type) order.push(event.type);
    if (event.type === "reasoning-delta" && typeof event.delta === "string") reasoning += event.delta;
    if (event.type === "text-delta" && typeof event.delta === "string") text += event.delta;
  }
  return { order, reasoning, text };
}

afterAll(() => {
  for (const id of householdIds) db.delete(user).where(eq(user.id, id)).run();
});

describe("chat route and attributed tools", () => {
  it("AC-LLM-2 maps an unavailable persisted model to 400", async () => {
    const fixture = await makeFixture("bad-model", ["Alex"]);
    db.update(conversations).set({ model: "unknown:nope" }).where(eq(conversations.id, fixture.conversationId)).run();
    const prior = process.env.MOCK_LLM;
    delete process.env.MOCK_LLM;
    const response = await postChat(new Request("http://localhost:3000/api/chat", {
      method: "POST", headers: { cookie: fixture.cookie, "content-type": "application/json" },
      body: JSON.stringify({ conversationId: fixture.conversationId, messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "hello" }] }] }),
    }));
    if (prior === undefined) delete process.env.MOCK_LLM; else process.env.MOCK_LLM = prior;
    expect(response.status).toBe(400);
  });

  it("AC-LLM-4 executes every scripted mock tool call and follows each with assistant text", async () => {
    const fixture = await makeFixture("all-mock-triggers");
    const toolTriggers = Object.entries(MOCK_SCRIPTS).filter(([trigger]) => trigger !== "MOCK:LONGTRACE" && trigger !== "MOCK:FAIL");
    for (const [trigger, confirmation] of toolTriggers) {
      const stream = await send(fixture, trigger);
      expect(streamedText(stream)).toContain(confirmation);
      expect(stream).toContain("tool-");
    }
    expect(db.select().from(tastingNotes).where(eq(tastingNotes.householdId, fixture.householdId)).all().length).toBeGreaterThanOrEqual(3);
    expect(db.select().from(recommendations).where(eq(recommendations.householdId, fixture.householdId)).all()).toHaveLength(2);
  }, 30_000); // iterates every scripted trigger through the delayed two-step mock stream

  it("AC-LLM-10 emits 80 delayed numbered reasoning lines without tools and fails after one safe partial delta", async () => {
    const fixture = await makeFixture("longtrace-fail", ["Alex"]);
    const long = await send(fixture, "MOCK:LONGTRACE");
    const events = streamedParts(long);
    expect(events.reasoning.match(/checking a safe wine-learning signal/g)).toHaveLength(80);
    expect(events.reasoning).toContain("01 ·");
    expect(events.reasoning).toContain("80 ·");
    expect(events.text).toContain("The long reasoning summary is complete.");
    expect(long).not.toContain("tool-input");
    expect(long.toLowerCase()).not.toContain("chain of thought");

    const failedResponse = await postChat(new Request("http://localhost:3000/api/chat", {
      method: "POST", headers: { cookie: fixture.cookie, "content-type": "application/json" },
      body: JSON.stringify({ conversationId: fixture.conversationId, messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "MOCK:FAIL" }] }] }),
    }));
    const failedReader = failedResponse.body?.getReader();
    const decoder = new TextDecoder();
    let failed = "";
    try {
      while (failedReader) {
        const chunk = await failedReader.read();
        if (chunk.done) break;
        failed += decoder.decode(chunk.value, { stream: true });
      }
    } catch { /* the fixture intentionally terminates the HTTP stream */ }
    expect(streamedText(failed)).toBe("I started checking that…");
    expect(failed).not.toContain("tool-input");
    expect(failed).not.toContain("RAW_PROVIDER_DIAGNOSTIC");
    await waitFor(() => db.select().from(chatRuns).where(eq(chatRuns.conversationId, fixture.conversationId)).orderBy(chatRuns.startedAt).all().at(-1)?.status === "failed");
    const run = db.select().from(chatRuns).where(eq(chatRuns.conversationId, fixture.conversationId)).orderBy(chatRuns.startedAt).all().at(-1);
    expect(run).toMatchObject({ status: "failed", safeError: "The response could not be generated. Please try again." });
  }, 15_000);

  it("AC-DATA-8 AC-CHAT-17 AC-CHAT-18 drains a canceled client stream, checkpoints, rejoins, and invokes tools once", async () => {
    const fixture = await makeFixture("durable-disconnect", ["Alex"]);
    const userMessageId = crypto.randomUUID();
    const body = JSON.stringify({ conversationId: fixture.conversationId, messages: [{ id: userMessageId, role: "user", parts: [{ type: "text", text: "MOCK:LIVE" }] }] });
    const response = await postChat(new Request("http://localhost:3000/api/chat", { method: "POST", headers: { cookie: fixture.cookie, "content-type": "application/json" }, body }));
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel("simulate navigation");
    const active = db.select().from(chatRuns).where(eq(chatRuns.userMessageId, userMessageId)).get();
    expect(active).toMatchObject({ status: "running", householdId: fixture.householdId });

    const deleteWhileRunning = await deleteConversation(new Request(`http://localhost:3000/api/conversations/${fixture.conversationId}`, { method: "DELETE", headers: { cookie: fixture.cookie } }), { params: Promise.resolve({ id: fixture.conversationId }) });
    expect(deleteWhileRunning.status).toBe(409);
    const competing = await postChat(new Request("http://localhost:3000/api/chat", {
      method: "POST", headers: { cookie: fixture.cookie, "content-type": "application/json" },
      body: JSON.stringify({ conversationId: fixture.conversationId, messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "duplicate" }] }] }),
    }));
    expect(competing.status).toBe(409);

    await waitFor(() => db.select().from(chatRuns).where(eq(chatRuns.userMessageId, userMessageId)).get()?.status === "completed");
    expect(db.select().from(tastingNotes).where(and(eq(tastingNotes.conversationId, fixture.conversationId), eq(tastingNotes.profileId, fixture.profileIds[0] as string))).all()).toHaveLength(1);
    const detail = await getConversation(new Request(`http://localhost:3000/api/conversations/${fixture.conversationId}`, { headers: { cookie: fixture.cookie } }), { params: Promise.resolve({ id: fixture.conversationId }) });
    const payload = await detail.json() as { messages: Array<{ role: string; parts: Array<{ type: string }> }>; run: { status: string } };
    expect(payload.run.status).toBe("completed");
    expect(payload.messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(payload.messages.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(payload.messages.flatMap((message) => message.parts).some((part) => part.type.startsWith("tool-"))).toBe(true);

    const retry = await postChat(new Request("http://localhost:3000/api/chat", { method: "POST", headers: { cookie: fixture.cookie, "content-type": "application/json" }, body }));
    expect(retry.status).toBe(200);
    expect(db.select().from(chatRuns).where(eq(chatRuns.userMessageId, userMessageId)).all()).toHaveLength(1);
    expect(db.select().from(tastingNotes).where(eq(tastingNotes.conversationId, fixture.conversationId)).all()).toHaveLength(1);
  }, 15_000);

  it("AC-CHAT-11 AC-CHAT-13 AC-CHAT-14 returns stable scoped title-search pages and renames without changing activity", async () => {
    const fixture = await makeFixture("history-contract", ["Alex"]);
    const outsider = await makeFixture("history-outsider", ["Morgan"]);
    const base = Date.now() - 100_000;
    for (let index = 0; index < 54; index += 1) db.insert(conversations).values({
      id: crypto.randomUUID(), householdId: fixture.householdId, participantIds: fixture.profileIds,
      title: index % 10 === 0 ? `Burgundy lesson ${index}` : `Chat ${index}`, model: "mock:mock-model", createdAt: new Date(base + index), updatedAt: new Date(base + index),
    }).run();
    const first = await listConversations(new Request("http://localhost:3000/api/conversations?limit=25", { headers: { cookie: fixture.cookie } }));
    const firstPayload = await first.json() as { conversations: Array<{ id: string; title: string; preview: string }>; nextCursor: string };
    expect(firstPayload.conversations).toHaveLength(25);
    expect(firstPayload.conversations[0]?.preview).toBe("No messages yet");
    const second = await listConversations(new Request(`http://localhost:3000/api/conversations?limit=25&cursor=${encodeURIComponent(firstPayload.nextCursor)}`, { headers: { cookie: fixture.cookie } }));
    const secondPayload = await second.json() as { conversations: Array<{ id: string }> };
    expect(secondPayload.conversations).toHaveLength(25);
    expect(new Set([...firstPayload.conversations, ...secondPayload.conversations].map((row) => row.id)).size).toBe(50);
    expect((await listConversations(new Request("http://localhost:3000/api/conversations?limit=51", { headers: { cookie: fixture.cookie } }))).status).toBe(400);
    expect((await listConversations(new Request("http://localhost:3000/api/conversations?cursor=bad", { headers: { cookie: fixture.cookie } }))).status).toBe(400);
    const search = await listConversations(new Request("http://localhost:3000/api/conversations?q=BURGUNDY", { headers: { cookie: fixture.cookie } }));
    const searchRows = (await search.json() as { conversations: Array<{ title: string }> }).conversations;
    expect(searchRows).toHaveLength(6);
    expect(searchRows.every((row) => row.title.includes("Burgundy"))).toBe(true);
    const outsiderRows = (await (await listConversations(new Request("http://localhost:3000/api/conversations", { headers: { cookie: outsider.cookie } }))).json() as { conversations: Array<{ id: string }> }).conversations;
    expect(outsiderRows.some((row) => firstPayload.conversations.some((ours) => ours.id === row.id))).toBe(false);

    const row = db.select().from(conversations).where(eq(conversations.id, firstPayload.conversations[0]?.id ?? "")).get();
    const renamed = await renameConversation(new Request(`http://localhost:3000/api/conversations/${row?.id}`, { method: "PATCH", headers: { cookie: fixture.cookie, "content-type": "application/json" }, body: JSON.stringify({ title: "  Cellar questions  " }) }), { params: Promise.resolve({ id: row?.id ?? "" }) });
    expect(renamed.status).toBe(200);
    expect(db.select().from(conversations).where(eq(conversations.id, row?.id ?? "")).get()).toMatchObject({ title: "Cellar questions", updatedAt: row?.updatedAt });
    expect((await renameConversation(new Request(`http://localhost:3000/api/conversations/${row?.id}`, { method: "PATCH", headers: { cookie: fixture.cookie, "content-type": "application/json" }, body: JSON.stringify({ title: "" }) }), { params: Promise.resolve({ id: row?.id ?? "" }) })).status).toBe(400);
    expect((await renameConversation(new Request(`http://localhost:3000/api/conversations/${row?.id}`, { method: "PATCH", headers: { cookie: outsider.cookie, "content-type": "application/json" }, body: JSON.stringify({ title: "stolen" }) }), { params: Promise.resolve({ id: row?.id ?? "" }) })).status).toBe(404);
  });

  it("AC-DATA-7 AC-CHAT-15 AC-CHAT-19 preserves learned data on deletion and recovers stale runs safely", async () => {
    const fixture = await makeFixture("delete-stale", ["Alex"]);
    await send(fixture, "MOCK:TASTING");
    await waitFor(() => db.select().from(chatRuns).where(eq(chatRuns.conversationId, fixture.conversationId)).get()?.status === "completed");
    const noteBefore = db.select().from(tastingNotes).where(eq(tastingNotes.conversationId, fixture.conversationId)).get();
    const wineBefore = db.select().from(wines).where(eq(wines.id, noteBefore?.wineId ?? "")).get();
    const userId = crypto.randomUUID(); const assistantId = crypto.randomUUID();
    db.insert(messages).values([
      { id: userId, conversationId: fixture.conversationId, role: "user", parts: [{ type: "text", text: "stale" }] },
      { id: assistantId, conversationId: fixture.conversationId, role: "assistant", parts: [] },
    ]).run();
    db.insert(chatRuns).values({ id: crypto.randomUUID(), householdId: fixture.householdId, conversationId: fixture.conversationId, userMessageId: userId, assistantMessageId: assistantId, status: "running", heartbeatAt: new Date(Date.now() - 61_000) }).run();
    const detail = await getConversation(new Request(`http://localhost:3000/api/conversations/${fixture.conversationId}`, { headers: { cookie: fixture.cookie } }), { params: Promise.resolve({ id: fixture.conversationId }) });
    const recent = (await detail.json() as { run: { status: string; safeError: string } }).run;
    expect(recent).toMatchObject({ status: "interrupted", safeError: "The response was interrupted. You can send another message." });
    expect(JSON.stringify(recent)).not.toContain("RAW_PROVIDER_DIAGNOSTIC");
    const deleted = await deleteConversation(new Request(`http://localhost:3000/api/conversations/${fixture.conversationId}`, { method: "DELETE", headers: { cookie: fixture.cookie } }), { params: Promise.resolve({ id: fixture.conversationId }) });
    expect(deleted.status).toBe(204);
    expect(db.select().from(conversations).where(eq(conversations.id, fixture.conversationId)).get()).toBeUndefined();
    expect(db.select().from(messages).where(eq(messages.conversationId, fixture.conversationId)).all()).toHaveLength(0);
    expect(db.select().from(chatRuns).where(eq(chatRuns.conversationId, fixture.conversationId)).all()).toHaveLength(0);
    expect(db.select().from(tastingNotes).where(eq(tastingNotes.id, noteBefore?.id ?? "")).get()?.conversationId).toBeNull();
    expect(db.select().from(wines).where(eq(wines.id, wineBefore?.id ?? "")).get()).toEqual(wineBefore);
  }, 10_000);

  it("AC-LLM-8 streams and executes application tools against a representative Gemma 4 model", async () => {
    const fixture = await makeFixture("gemma-contract", ["Alex"]);
    const profileId = fixture.profileIds[0] as string;
    const tastingInput = {
      taster_profile_id: profileId,
      wine: { name: "Gemma Gamay", grapes: ["Gamay"], style: "red" as const },
      note: { nose: ["cherry"], palate: { sweetness: 1, acidity: 4, tannin: 2, alcohol: 3, body: 2, flavors: ["cherry"] }, verdict: "liked" as const },
    };
    // A self-hosted OpenAI-compatible model (Gemma 4) is only exposed after it proves streaming
    // text plus the enabled tool contracts. This fixture stands in for that inference server.
    const gemma = new MockLanguageModelV2({
      provider: "openai-compatible", modelId: "gemma-4-12b-it",
      doStream: async ({ prompt }) => {
        const hasToolResult = prompt.some((message) => message.role === "tool");
        const chunks: LanguageModelV2StreamPart[] = hasToolResult
          ? [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "g" },
             { type: "text-delta", id: "g", delta: "Logged your Gamay." }, { type: "text-end", id: "g" },
             { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }]
          : [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "g" },
             { type: "text-delta", id: "g", delta: "Recording… " }, { type: "text-end", id: "g" },
             { type: "tool-call", toolCallId: "gemma-1", toolName: "record_tasting_note", input: JSON.stringify(tastingInput) },
             { type: "finish", finishReason: "tool-calls", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }];
        return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 0 }) };
      },
    });
    const tools = createChatTools({ conversationId: fixture.conversationId, householdId: fixture.householdId, participantIds: fixture.profileIds });
    const result = streamText({ model: gemma, tools, messages: [{ role: "user", content: "Log my tasting" }], stopWhen: stepCountIs(2) });
    let text = "";
    for await (const delta of result.textStream) text += delta;
    expect(text).toContain("Logged your Gamay.");
    const notes = db.select().from(tastingNotes).where(eq(tastingNotes.householdId, fixture.householdId)).all();
    expect(notes).toHaveLength(1);
    expect(db.select().from(wines).where(eq(wines.id, notes[0]?.wineId ?? "")).get()?.name).toBe("Gemma Gamay");
  });

  it("AC-LLM-7 streams delayed interleaved reasoning and keeps protocol parts through the tool loop", async () => {
    const fixture = await makeFixture("reasoning-interleave", ["Alex"]);
    const stream = await send(fixture, "MOCK:REASON");
    const parts = streamedParts(stream);
    // Two interleaved reasoning summaries — one before the tool call, one after — plus the answer.
    expect(parts.reasoning).toContain("acidity and tannin history");
    expect(parts.reasoning).toContain("benchmark");
    expect(parts.text).toContain("I recorded that tasting after thinking through your acidity history.");
    const firstReasoning = parts.order.indexOf("reasoning-delta");
    const firstTool = parts.order.findIndex((type) => type.startsWith("tool-"));
    const firstText = parts.order.indexOf("text-delta");
    expect(firstReasoning).toBeGreaterThanOrEqual(0);
    expect(firstReasoning).toBeLessThan(firstTool);
    expect(firstTool).toBeLessThan(firstText);
    // The summary is never labelled as a raw internal scratchpad.
    expect(stream.toLowerCase()).not.toContain("chain of thought");
    // Protocol parts persist for model/tool continuity: the stored assistant turn keeps reasoning + tool parts.
    const stored = db.select().from(messages).where(and(eq(messages.conversationId, fixture.conversationId), eq(messages.role, "assistant"))).all();
    const partTypes = stored.flatMap((message) => message.parts.map((part) => part.type));
    expect(partTypes).toContain("reasoning");
    expect(partTypes.some((type) => type.startsWith("tool-"))).toBe(true);
  });

  it("AC-CHAT-5 and AC-DATA-5 reject non-participant attribution and foreign-household conversation context", async () => {
    const fixture = await makeFixture("tool-scope", ["Alex"]);
    const outsider = await makeFixture("tool-outsider", ["Morgan"]);
    const tools = createChatTools({ conversationId: fixture.conversationId, householdId: fixture.householdId, participantIds: fixture.profileIds });
    await expect(tools.update_palate_profile.execute?.({ taster_profile_id: outsider.profileIds[0] as string, tannin: 4 }, { toolCallId: "scope", messages: [] }))
      .rejects.toThrow(/not a conversation participant/);
    const foreignTools = createChatTools({ conversationId: fixture.conversationId, householdId: outsider.householdId, participantIds: fixture.profileIds });
    await expect(foreignTools.update_palate_profile.execute?.({ taster_profile_id: fixture.profileIds[0] as string, tannin: 4 }, { toolCallId: "foreign", messages: [] }))
      .rejects.toThrow(/Conversation not found/);
    const foreignParticipantConversation = await createConversation(new Request("http://localhost:3000/api/conversations", {
      method: "POST", headers: { cookie: outsider.cookie, "content-type": "application/json" },
      body: JSON.stringify({ participantIds: fixture.profileIds, model: "mock:mock-model" }),
    }));
    expect(foreignParticipantConversation.status).toBe(404);
  });

  it("AC-CHAT-6 and AC-DATA-6 shared notes coexist with distinct attribution while one wine is upserted", async () => {
    const fixture = await makeFixture("shared-contract");
    await send(fixture, "MOCK:SHARED");
    const notes = db.select().from(tastingNotes).where(and(eq(tastingNotes.householdId, fixture.householdId), eq(tastingNotes.conversationId, fixture.conversationId))).all();
    expect(notes).toHaveLength(2);
    expect(new Set(notes.map((note) => note.profileId)).size).toBe(2);
    expect(new Set(notes.map((note) => note.rating))).toEqual(new Set([4, 2]));
    expect(new Set(notes.map((note) => note.wineId)).size).toBe(1);
    expect(db.select().from(wines).where(eq(wines.id, notes[0]?.wineId ?? "")).all()).toHaveLength(1);
  });

  it("AC-MEM-3 and AC-MEM-5 merge one participant's palate without clobbering dimensions or the other participant", async () => {
    const fixture = await makeFixture("palate-merge");
    db.update(palateProfiles).set({ sweetness: 3, notes: "Original evidence." }).where(eq(palateProfiles.profileId, fixture.profileIds[0] as string)).run();
    await send(fixture, "MOCK:PROFILE");
    const first = db.select().from(palateProfiles).where(eq(palateProfiles.profileId, fixture.profileIds[0] as string)).get();
    const second = db.select().from(palateProfiles).where(eq(palateProfiles.profileId, fixture.profileIds[1] as string)).get();
    expect(first).toMatchObject({ sweetness: 3, tannin: 4 });
    expect(first?.notes).toContain("Original evidence.");
    expect(first?.notes).toContain("Enjoys bold reds.");
    expect(second?.tannin).toBeNull();
    expect(second?.notes).toBe("");
  });

  it("AC-SRCH-3 returns an unavailable marker when no search provider is configured", async () => {
    const fixture = await makeFixture("null-search", ["Alex"]);
    const previousMock = process.env.MOCK_LLM;
    const previousKey = process.env.TAVILY_API_KEY;
    delete process.env.MOCK_LLM;
    delete process.env.TAVILY_API_KEY;
    const search = createChatTools({ conversationId: fixture.conversationId, householdId: fixture.householdId, participantIds: fixture.profileIds }).search_wine_availability;
    const result = await search.execute?.({ query: "Malbec", location: "Brooklyn NY" }, { toolCallId: "search", messages: [] });
    if (previousMock === undefined) delete process.env.MOCK_LLM; else process.env.MOCK_LLM = previousMock;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previousKey;
    expect(result).toEqual({ unavailable: true, sources: [] });
  });

  it("AC-SRCH-6 makes zero network calls in mock mode even with a Tavily key present", async () => {
    const fixture = await makeFixture("mock-zero-network", ["Alex"]);
    const previousKey = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = "should-never-be-used"; // MOCK_LLM=1 is set by the test env
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = ((...args: Parameters<typeof originalFetch>) => { fetchCalls += 1; return originalFetch(...args); }) as typeof fetch;
    try {
      const tools = createChatTools({ conversationId: fixture.conversationId, householdId: fixture.householdId, participantIds: fixture.profileIds });
      const web = await tools.search_web.execute?.({ query: "current Barolo release rules" }, { toolCallId: "w", messages: [] }) as { sources: unknown[] };
      const availability = await tools.search_wine_availability.execute?.({ query: "Malbec", location: "New York NY" }, { toolCallId: "a", messages: [] }) as { sources: unknown[] };
      expect(web.sources.length).toBeGreaterThan(0);
      expect(availability.sources.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previousKey;
    }
    expect(fetchCalls).toBe(0);
  });

  it("AC-SRCH-8 asks for a missing location and discloses an unverifiable availability result", async () => {
    const fixture = await makeFixture("srch-scope", ["Alex"]);
    const tools = createChatTools({ conversationId: fixture.conversationId, householdId: fixture.householdId, participantIds: fixture.profileIds });
    // Nearby buying with no location must ask for one rather than guessing.
    const missing = await tools.search_wine_availability.execute?.({ query: "Malbec" }, { toolCallId: "m", messages: [] });
    expect(missing).toEqual({ unavailable: true, needs_location: true, sources: [] });
    // With a location but no configured provider, the result is an explicit unavailable marker
    // with no fabricated stores, stock, or prices.
    const previousMock = process.env.MOCK_LLM;
    const previousKey = process.env.TAVILY_API_KEY;
    delete process.env.MOCK_LLM;
    delete process.env.TAVILY_API_KEY;
    const unverifiable = await createChatTools({ conversationId: fixture.conversationId, householdId: fixture.householdId, participantIds: fixture.profileIds })
      .search_wine_availability.execute?.({ query: "Malbec", location: "Brooklyn NY" }, { toolCallId: "u", messages: [] });
    if (previousMock === undefined) delete process.env.MOCK_LLM; else process.env.MOCK_LLM = previousMock;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previousKey;
    expect(unverifiable).toEqual({ unavailable: true, sources: [] });
  });

  it("AC-SRCH-7 persists deduplicated safe source parts with server-trusted provenance", async () => {
    const fixture = await makeFixture("srch-sources", ["Alex"]);
    await send(fixture, "MOCK:SEARCH");
    const stored = db.select().from(messages).where(and(eq(messages.conversationId, fixture.conversationId), eq(messages.role, "assistant"))).all();
    const toolParts = stored.flatMap((message) => message.parts.filter((part) => part.type === "tool-search_wine_availability"));
    expect(toolParts.length).toBeGreaterThan(0);
    const output = (toolParts[0] as { output?: { sources?: Array<Record<string, unknown>> } }).output;
    expect(output?.sources?.length).toBeGreaterThan(0);
    const source = output?.sources?.[0] ?? {};
    expect(String(source.url)).toMatch(/^https:\/\//);
    expect(source.provider).toBe("fixture");
    expect(typeof source.query).toBe("string");
    // Only safe, linkable fields persist — no raw provider payload, credentials, or tracking metadata.
    expect(Object.keys(source).sort()).toEqual(["provider", "query", "snippet", "title", "url"]);
  });

  it("AC-JRNL-3 applies taster, verdict, and style filters together", async () => {
    const fixture = await makeFixture("journal-filters");
    await send(fixture, "MOCK:SHARED");
    const url = new URL("http://localhost:3000/api/journal");
    url.searchParams.set("taster", fixture.profileIds[0] as string);
    url.searchParams.set("verdict", "liked");
    url.searchParams.set("style", "red");
    const response = await listJournal(new Request(url, { headers: { cookie: fixture.cookie } }));
    const payload = await response.json() as { notes: Array<{ note: { profileId: string; verdict: string }; wine: { style: string } }> };
    expect(payload.notes).toHaveLength(1);
    expect(payload.notes[0]).toMatchObject({ note: { profileId: fixture.profileIds[0], verdict: "liked" }, wine: { style: "red" } });
    const noMatchUrl = new URL(url); noMatchUrl.searchParams.set("style", "white");
    const noMatch = await listJournal(new Request(noMatchUrl, { headers: { cookie: fixture.cookie } }));
    expect(((await noMatch.json()) as { notes: unknown[] }).notes).toHaveLength(0);
  });

  it("AC-JRNL-4 and AC-DATA-4 delete an owned note and return 404 without deleting a foreign note", async () => {
    const owner = await makeFixture("journal-owner", ["Alex"]);
    const outsider = await makeFixture("journal-outsider", ["Sam"]);
    await send(owner, "MOCK:TASTING");
    const note = db.select().from(tastingNotes).where(eq(tastingNotes.householdId, owner.householdId)).get();
    expect(note).toBeDefined();
    const foreignAttempt = await deleteJournalNote(new Request(`http://localhost:3000/api/journal/${note?.id}`, {
      method: "DELETE", headers: { cookie: outsider.cookie },
    }), { params: Promise.resolve({ id: note?.id ?? "" }) });
    expect(foreignAttempt.status).toBe(404);
    expect(db.select().from(tastingNotes).where(eq(tastingNotes.id, note?.id ?? "")).get()).toBeDefined();
    const ownedDelete = await deleteJournalNote(new Request(`http://localhost:3000/api/journal/${note?.id}`, {
      method: "DELETE", headers: { cookie: owner.cookie },
    }), { params: Promise.resolve({ id: note?.id ?? "" }) });
    expect(ownedDelete.status).toBe(204);
    expect(db.select().from(tastingNotes).where(eq(tastingNotes.id, note?.id ?? "")).get()).toBeUndefined();
  });

  it("AC-REC-3 AC-REC-4 and AC-DATA-4 scope recommendation lifecycle and conversation reads to their household", async () => {
    const owner = await makeFixture("recommendation-owner", ["Alex"]);
    const outsider = await makeFixture("recommendation-outsider", ["Sam"]);
    await send(owner, "MOCK:REC");
    const recommendation = db.select().from(recommendations).where(eq(recommendations.householdId, owner.householdId)).get();
    expect(recommendation).toBeDefined();
    const foreignPatch = await patchRecommendation(new Request(`http://localhost:3000/api/recommendations/${recommendation?.id}`, {
      method: "PATCH", headers: { cookie: outsider.cookie, "content-type": "application/json" }, body: JSON.stringify({ status: "dismissed" }),
    }), { params: Promise.resolve({ id: recommendation?.id ?? "" }) });
    expect(foreignPatch.status).toBe(404);
    const ownPatch = await patchRecommendation(new Request(`http://localhost:3000/api/recommendations/${recommendation?.id}`, {
      method: "PATCH", headers: { cookie: owner.cookie, "content-type": "application/json" }, body: JSON.stringify({ status: "dismissed" }),
    }), { params: Promise.resolve({ id: recommendation?.id ?? "" }) });
    expect(ownPatch.status).toBe(200);
    expect(db.select().from(recommendations).where(eq(recommendations.id, recommendation?.id ?? "")).get()?.status).toBe("dismissed");
    const outsiderList = await getRecommendations(new Request("http://localhost:3000/api/recommendations?target=all", { headers: { cookie: outsider.cookie } }));
    expect(((await outsiderList.json()) as { recommendations: unknown[] }).recommendations).toHaveLength(0);
    const foreignConversation = await getConversation(new Request(`http://localhost:3000/api/conversations/${owner.conversationId}`, { headers: { cookie: outsider.cookie } }), { params: Promise.resolve({ id: owner.conversationId }) });
    expect(foreignConversation.status).toBe(404);
  });

  it("AC-REC-8 prevents normalized duplicates across profile and joint recommendation sections", async () => {
    const fixture = await makeFixture("recommendation-dedup");
    const tools = createChatTools({
      conversationId: fixture.conversationId,
      householdId: fixture.householdId,
      participantIds: fixture.profileIds,
    });
    const first = await tools.save_recommendation.execute?.({
      for_profile_id: fixture.profileIds[0] as string,
      wine_name: "  Château   Test  ",
      producer: " Domaine   Example ",
      reasoning: "A bright profile pick.",
    }, { toolCallId: "first", messages: [] });
    const duplicate = await tools.save_recommendation.execute?.({
      for_profile_id: null,
      wine_name: "château test",
      producer: "domaine example",
      reasoning: "The same wine offered for the table.",
    }, { toolCallId: "duplicate", messages: [] });
    expect(first).toMatchObject({ saved: true });
    const memory = loadMemoryContext(fixture.householdId, [fixture.profileIds[0] as string]);
    expect(memory.participantMemory).toContain("CURRENT VISIBLE RECOMMENDATIONS");
    expect(memory.participantMemory).toContain("- Château Test | producer: Domaine Example");
    expect(duplicate).toMatchObject({
      saved: false, duplicate: true, retry: true,
      recommendation_id: (first as { recommendation_id: string }).recommendation_id,
      message: expect.stringMatching(/choose a different wine/i),
    });
    let rows = db.select().from(recommendations).where(eq(recommendations.householdId, fixture.householdId)).all();
    expect(rows).toHaveLength(1);

    const firstId = rows[0]?.id ?? "";
    const dismiss = await patchRecommendation(new Request(`http://localhost:3000/api/recommendations/${firstId}`, {
      method: "PATCH", headers: { cookie: fixture.cookie, "content-type": "application/json" }, body: JSON.stringify({ status: "dismissed" }),
    }), { params: Promise.resolve({ id: firstId }) });
    expect(dismiss.status).toBe(200);
    const replacement = await tools.save_recommendation.execute?.({
      for_profile_id: null,
      wine_name: "CHÂTEAU TEST",
      producer: "DOMAINE EXAMPLE",
      reasoning: "Eligible again after the prior recommendation left the visible sections.",
    }, { toolCallId: "replacement", messages: [] });
    expect(replacement).toMatchObject({ saved: true });

    rows = db.select().from(recommendations).where(eq(recommendations.householdId, fixture.householdId)).all();
    expect(rows).toHaveLength(2);
    const reactivate = await patchRecommendation(new Request(`http://localhost:3000/api/recommendations/${firstId}`, {
      method: "PATCH", headers: { cookie: fixture.cookie, "content-type": "application/json" }, body: JSON.stringify({ status: "purchased" }),
    }), { params: Promise.resolve({ id: firstId }) });
    expect(reactivate.status).toBe(409);

    // Listing also protects the UI from legacy duplicate rows that bypassed the tool invariant.
    db.insert(recommendations).values({
      id: crypto.randomUUID(), householdId: fixture.householdId, profileId: fixture.profileIds[1],
      wineName: " château    test ", producer: " domaine   example ", reasoning: "Legacy duplicate.",
      status: "suggested", source: "dashboard",
    }).run();
    const response = await getRecommendations(new Request("http://localhost:3000/api/recommendations?target=all", { headers: { cookie: fixture.cookie } }));
    const listed = (await response.json()) as { recommendations: Array<{ status: string }> };
    expect(listed.recommendations.filter((item) => item.status === "suggested" || item.status === "purchased")).toHaveLength(1);
    expect(listed.recommendations.filter((item) => item.status === "dismissed")).toHaveLength(1);
  });
});
