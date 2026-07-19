import { and, desc, eq, isNull } from "drizzle-orm";
import { generateText, stepCountIs } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { recommendations } from "@/db/schema";
import { getDefaultModel, getModel } from "@/lib/llm/registry";
import { buildSystemPrompt } from "@/lib/llm/system-prompt";
import { createChatTools } from "@/lib/llm/tools";
import { loadConversationMemory } from "@/server/memory";
import { listProfiles } from "@/server/profiles";
import { getActiveProfileFromRequest, getHouseholdSession } from "@/server/session";

const schema = z.object({ mode: z.enum(["profile", "joint"]) });

export async function POST(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid generation mode." }, { status: 400 });
  const active = getActiveProfileFromRequest(session, request);
  if (!active) return NextResponse.json({ error: "Active profile required." }, { status: 409 });
  const householdProfiles = listProfiles(session.user.id);
  if (parsed.data.mode === "joint" && householdProfiles.length < 2) return NextResponse.json({ error: "Joint recommendations require at least two profiles." }, { status: 400 });
  const participantIds = parsed.data.mode === "joint" ? householdProfiles.map((profile) => profile.id) : [active.id];
  const tools = createChatTools({ householdId: session.user.id, participantIds, recommendationSource: "dashboard" });
  await generateText({
    model: getModel(getDefaultModel()),
    system: buildSystemPrompt(loadConversationMemory(session.user.id, participantIds), participantIds.length > 1),
    prompt: process.env.MOCK_LLM === "1" ? (parsed.data.mode === "joint" ? "MOCK:JOINTREC" : "MOCK:REC")
      : parsed.data.mode === "joint" ? "Save one to three concrete recommendations that fit the overlap among every participant's palate." : "Save one to three concrete next-bottle recommendations for the active taster.",
    tools: { save_recommendation: tools.save_recommendation }, stopWhen: stepCountIs(2),
  });
  const targetCondition = parsed.data.mode === "joint" ? isNull(recommendations.profileId) : eq(recommendations.profileId, active.id);
  const rows = db.select().from(recommendations).where(and(eq(recommendations.householdId, session.user.id), targetCondition)).orderBy(desc(recommendations.createdAt)).all();
  return NextResponse.json({ recommendations: rows });
}
