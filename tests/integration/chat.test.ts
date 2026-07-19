import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { POST as postChat } from "../../src/app/api/chat/route";
import { POST as createConversation } from "../../src/app/api/conversations/route";
import { POST as createProfile } from "../../src/app/api/profiles/route";
import { db } from "../../src/db/client";
import { conversations, palateProfiles, recommendations, tastingNotes, user, wines } from "../../src/db/schema";
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
  });

  it("AC-CHAT-5 rejects non-participant attribution and foreign-household conversation context", async () => {
    const fixture = await makeFixture("tool-scope", ["Alex"]);
    const outsider = await makeFixture("tool-outsider", ["Morgan"]);
    const tools = createChatTools({ conversationId: fixture.conversationId, householdId: fixture.householdId, participantIds: fixture.profileIds });
    await expect(tools.update_palate_profile.execute?.({ taster_profile_id: outsider.profileIds[0] as string, tannin: 4 }, { toolCallId: "scope", messages: [] }))
      .rejects.toThrow(/not a conversation participant/);
    const foreignTools = createChatTools({ conversationId: fixture.conversationId, householdId: outsider.householdId, participantIds: fixture.profileIds });
    await expect(foreignTools.update_palate_profile.execute?.({ taster_profile_id: fixture.profileIds[0] as string, tannin: 4 }, { toolCallId: "foreign", messages: [] }))
      .rejects.toThrow(/Conversation not found/);
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
    const result = await search.execute?.({ query: "Malbec" }, { toolCallId: "search", messages: [] });
    if (previousMock === undefined) delete process.env.MOCK_LLM; else process.env.MOCK_LLM = previousMock;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previousKey;
    expect(result).toEqual({ unavailable: true, results: [] });
  });
});
