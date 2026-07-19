import { and, eq } from "drizzle-orm";
import { streamText, stepCountIs } from "ai";
import type { LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV2, simulateReadableStream } from "ai/test";
import { afterAll, describe, expect, it } from "vitest";
import { POST as postChat } from "../../src/app/api/chat/route";
import { POST as createConversation } from "../../src/app/api/conversations/route";
import { GET as getConversation } from "../../src/app/api/conversations/[id]/route";
import { GET as listJournal } from "../../src/app/api/journal/route";
import { DELETE as deleteJournalNote } from "../../src/app/api/journal/[id]/route";
import { GET as getRecommendations } from "../../src/app/api/recommendations/route";
import { PATCH as patchRecommendation } from "../../src/app/api/recommendations/[id]/route";
import { POST as createProfile } from "../../src/app/api/profiles/route";
import { db } from "../../src/db/client";
import { conversations, messages, palateProfiles, recommendations, tastingNotes, user, wines } from "../../src/db/schema";
import { auth } from "../../src/lib/auth";
import { MOCK_SCRIPTS } from "../../src/lib/llm/mock";
import { createChatTools } from "../../src/lib/llm/tools";

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
    for (const [trigger, confirmation] of Object.entries(MOCK_SCRIPTS)) {
      const stream = await send(fixture, trigger);
      expect(streamedText(stream)).toContain(confirmation);
      expect(stream).toContain("tool-");
    }
    expect(db.select().from(tastingNotes).where(eq(tastingNotes.householdId, fixture.householdId)).all().length).toBeGreaterThanOrEqual(3);
    expect(db.select().from(recommendations).where(eq(recommendations.householdId, fixture.householdId)).all()).toHaveLength(2);
  }, 30_000); // iterates every scripted trigger through the delayed two-step mock stream

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
});
