import { stepCountIs, streamText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCacheMetrics } from "@/lib/llm/diagnostics";
import { getDefaultModel, getModel, getModelCapabilities } from "@/lib/llm/registry";
import { buildRecommendationRequest } from "@/lib/llm/request";
import { createChatTools } from "@/lib/llm/tools";
import { loadMemoryContext } from "@/server/memory";
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
  const modelId = getDefaultModel();
  const memory = loadMemoryContext(session.user.id, participantIds);
  const prompt = process.env.MOCK_LLM === "1" ? (parsed.data.mode === "joint" ? "MOCK:JOINTREC" : "MOCK:REC")
    : parsed.data.mode === "joint" ? "Save one to three concrete recommendations that fit the overlap among every participant's palate." : "Save one to three concrete next-bottle recommendations for the active taster.";
  const assembled = buildRecommendationRequest({
    capabilities: getModelCapabilities(modelId),
    participantMemory: memory.participantMemory, curriculum: memory.curriculum,
    shared: participantIds.length > 1, prompt,
  });
  // A non-chat operation: it streams reasoning + save_recommendation activity to drive the
  // NEURAL TRACE overlay and persists recommendations via the tool, but creates no conversation
  // or transcript (specs/07). The client refreshes the dashboard once the stream completes.
  const result = streamText({
    model: getModel(modelId),
    tools: { save_recommendation: tools.save_recommendation }, stopWhen: stepCountIs(2),
    onFinish: ({ providerMetadata }) => recordCacheMetrics(modelId, providerMetadata),
    system: assembled.system,
    messages: assembled.messages,
    providerOptions: assembled.providerOptions,
    allowSystemInMessages: assembled.allowSystemInMessages,
  });
  return result.toUIMessageStreamResponse({ sendReasoning: true, sendSources: true });
}
