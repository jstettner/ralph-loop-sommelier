import { generateText, stepCountIs, tool } from "ai";
import { getModel, getModelCapabilities } from "../src/lib/llm/registry";
import { buildRecommendationRequest } from "../src/lib/llm/request";
import { SAVE_RECOMMENDATION_DESCRIPTION, saveRecommendationSchema } from "../src/lib/llm/tools";
import { assembleRecommendationMemory, type MemoryRecommendation } from "../src/server/memory";
import { recommendationIdentity } from "../src/server/recommendations";

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_MODEL = "anthropic:claude-haiku-4-5-20251001";
const CURRICULUM = "CURRICULUM\n- Gamay: light-bodied, bright, and low in tannin.\n- Riesling: aromatic and high in acidity.";

type RecommendationInput = typeof saveRecommendationSchema._output;
type EvalOutcome = { name: string; attempts: RecommendationInput[]; inputTokens: number; outputTokens: number };

function requestedModel(): string {
  const argument = process.argv.find((value) => value.startsWith("--model="));
  return argument?.slice("--model=".length) || DEFAULT_MODEL;
}

function configureModel(modelId: string): void {
  if (process.env.MOCK_LLM === "1") throw new Error("Real-model evals cannot run with MOCK_LLM=1.");
  if (!process.env.ANTHROPIC_API_KEY && modelId.startsWith("anthropic:")) {
    throw new Error("ANTHROPIC_API_KEY is required for npm run eval:llm.");
  }
  const configured = new Set((process.env.AVAILABLE_MODELS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  configured.add(modelId);
  process.env.AVAILABLE_MODELS = [...configured].join(",");
}

function participantMemory(visible: MemoryRecommendation[]): string {
  return [
    `TASTER MEMORY\nPARTICIPANT ${PROFILE_ID} | Alex\nDimensions: acidity=4/5, tannin=2/5\nPalate notes: Enjoys bright, savory wines.`,
    assembleRecommendationMemory(visible),
  ].join("\n\n");
}

function assertDistinct(attempt: RecommendationInput, existing: MemoryRecommendation[], label: string): void {
  const existingIdentities = new Set(existing.map(recommendationIdentity));
  const identity = recommendationIdentity({ wineName: attempt.wine_name, producer: attempt.producer });
  if (existingIdentities.has(identity)) throw new Error(`${label}: model repeated visible wine ${attempt.wine_name}.`);
}

async function catalogAvoidance(modelId: string): Promise<EvalOutcome> {
  const visible: MemoryRecommendation[] = [
    { wineName: "Mendoza Malbec", producer: null },
    { wineName: "Etna Rosso", producer: "Tenuta delle Terre Nere" },
  ];
  const attempts: RecommendationInput[] = [];
  const assembled = buildRecommendationRequest({
    capabilities: getModelCapabilities(modelId), participantMemory: participantMemory(visible), curriculum: CURRICULUM,
    shared: false, prompt: "Recommend exactly one useful next bottle for Alex. Call save_recommendation once and do not repeat anything in CURRENT VISIBLE RECOMMENDATIONS.",
  });
  const result = await generateText({
    model: getModel(modelId),
    tools: { save_recommendation: tool({
      description: SAVE_RECOMMENDATION_DESCRIPTION,
      inputSchema: saveRecommendationSchema,
      execute: async (input) => { attempts.push(input); return { saved: true, recommendation_id: crypto.randomUUID() }; },
    }) },
    stopWhen: stepCountIs(3), system: assembled.system, messages: assembled.messages,
    providerOptions: assembled.providerOptions, allowSystemInMessages: assembled.allowSystemInMessages,
  });
  if (attempts.length !== 1 || !attempts[0]) throw new Error(`catalog avoidance: expected one tool call, received ${attempts.length}.`);
  assertDistinct(attempts[0], visible, "catalog avoidance");
  if (attempts[0].for_profile_id !== PROFILE_ID) throw new Error("catalog avoidance: recommendation targeted the wrong profile.");
  return { name: "catalog avoidance", attempts, inputTokens: result.totalUsage.inputTokens ?? 0, outputTokens: result.totalUsage.outputTokens ?? 0 };
}

async function duplicateRetry(modelId: string): Promise<EvalOutcome> {
  const attempts: RecommendationInput[] = [];
  const assembled = buildRecommendationRequest({
    capabilities: getModelCapabilities(modelId), participantMemory: participantMemory([]), curriculum: CURRICULUM,
    shared: false, prompt: "Recommend exactly one next bottle for Alex. Call save_recommendation. If it returns duplicate=true and retry=true, immediately choose a different wine and call save_recommendation again.",
  });
  const result = await generateText({
    model: getModel(modelId),
    tools: { save_recommendation: tool({
      description: SAVE_RECOMMENDATION_DESCRIPTION,
      inputSchema: saveRecommendationSchema,
      execute: async (input) => {
        attempts.push(input);
        return attempts.length === 1
          ? { saved: false, duplicate: true, retry: true, message: "That wine is already visible. Choose a different wine name + producer and try again." }
          : { saved: true, recommendation_id: crypto.randomUUID() };
      },
    }) },
    stopWhen: stepCountIs(3), system: assembled.system, messages: assembled.messages,
    providerOptions: assembled.providerOptions, allowSystemInMessages: assembled.allowSystemInMessages,
  });
  if (attempts.length !== 2 || !attempts[0] || !attempts[1]) throw new Error(`duplicate retry: expected two tool calls, received ${attempts.length}.`);
  if (recommendationIdentity({ wineName: attempts[0].wine_name, producer: attempts[0].producer }) === recommendationIdentity({ wineName: attempts[1].wine_name, producer: attempts[1].producer })) {
    throw new Error(`duplicate retry: model retried the same wine ${attempts[1].wine_name}.`);
  }
  return { name: "duplicate retry", attempts, inputTokens: result.totalUsage.inputTokens ?? 0, outputTokens: result.totalUsage.outputTokens ?? 0 };
}

async function main(): Promise<void> {
  const modelId = requestedModel();
  configureModel(modelId);
  const outcomes = [await catalogAvoidance(modelId), await duplicateRetry(modelId)];
  console.log(JSON.stringify({
    passed: true,
    model: modelId,
    evals: outcomes.map((outcome) => ({
      name: outcome.name,
      wines: outcome.attempts.map((attempt) => ({ wine: attempt.wine_name, producer: attempt.producer ?? null })),
      usage: { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens },
    })),
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
