import type { LanguageModelV2CallOptions, LanguageModelV2Message, LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV2, simulateReadableStream } from "ai/test";

export const MOCK_SCRIPTS = {
  "MOCK:TASTING": "I recorded the 2022 Malbec for your tasting journal.",
  "MOCK:SHARED": "I recorded separate notes for both tasters—your different reactions are useful palate data.",
  "MOCK:PROFILE": "I updated your palate profile with that preference for bold reds.",
  "MOCK:REC": "I saved a Mendoza Malbec as your next-bottle recommendation.",
  "MOCK:JOINTREC": "I saved a bottle for both of you: Cru Beaujolais, based on the overlap in your palates.",
  "MOCK:SEARCH": "Astor Wines appears in the availability results for Mendoza Malbec.",
  "MOCK:REASON": "I recorded that tasting after thinking through your acidity history.",
  "MOCK:LIVE": "Logged it — that Malbec is in your journal now.",
  "MOCK:LONGTRACE": "The long reasoning summary is complete.",
  "MOCK:FAIL": "The response could not be generated. Please try again.",
} as const;

type MockTrigger = keyof typeof MOCK_SCRIPTS;

// Provider-visible reasoning summaries only — never a raw internal scratchpad (specs/03).
const REASONING_SUMMARIES: Partial<Record<MockTrigger, { step1: string[]; step2: string[] }>> = {
  "MOCK:REASON": {
    step1: ["Weighing this taster's ", "acidity and tannin history ", "against the recorded ", "descriptors ", "to frame the note ", "carefully…"],
    step2: ["Comparing it to benchmark ", "styles ", "from the curriculum ", "before I answer…"],
  },
};

// A short assistant preface streamed BEFORE the tool call, proving partial text is visible while
// a tool row is still running (specs/04, AC-CHAT-9).
const PREFACES: Partial<Record<MockTrigger, string>> = {
  "MOCK:LIVE": "Working on your tasting note… ",
};

function textFromMessage(message: LanguageModelV2Message): string {
  if (typeof message.content === "string") return message.content;
  return message.content.flatMap((part) => "text" in part && typeof part.text === "string" ? [part.text] : []).join(" ");
}

function latestUserText(options: LanguageModelV2CallOptions): string {
  return [...options.prompt].reverse().find((message) => message.role === "user")
    ? textFromMessage([...options.prompt].reverse().find((message) => message.role === "user") as LanguageModelV2Message)
    : "";
}

function participants(options: LanguageModelV2CallOptions): string[] {
  const system = options.prompt.filter((message) => message.role === "system").map(textFromMessage).join("\n");
  return [...system.matchAll(/^PARTICIPANT ([^ |]+) \|/gm)].map((match) => match[1]).filter((id): id is string => Boolean(id));
}

function visibleRecommendationIdentities(options: LanguageModelV2CallOptions): Set<string> {
  const system = options.prompt.filter((message) => message.role === "system").map(textFromMessage).join("\n");
  const section = system.split("CURRENT VISIBLE RECOMMENDATIONS").at(-1) ?? "";
  return new Set([...section.matchAll(/^- (.+?) \| producer: (.+)$/gm)].map((match) => {
    const wine = (match[1] ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
    const rawProducer = match[2] === "(none)" ? "" : (match[2] ?? "");
    const producer = rawProducer.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
    return `${wine}\u0000${producer}`;
  }));
}

function triggerFor(text: string): MockTrigger | null {
  return (Object.keys(MOCK_SCRIPTS) as MockTrigger[]).find((trigger) => text.includes(trigger)) ?? null;
}

function hasToolResultAfterLatestUser(options: LanguageModelV2CallOptions): boolean {
  const latestUserIndex = options.prompt.findLastIndex((message) => message.role === "user");
  return options.prompt.slice(latestUserIndex + 1).some((message) => message.role === "tool");
}

function tastingArgs(profileId: string, sharedSecond = false) {
  return {
    taster_profile_id: profileId,
    wine: { name: "Fixture Malbec", producer: "Mock Cellars", vintage: 2022, grapes: ["Malbec"], region: "Mendoza", style: "red", price_band: "15_30" },
    note: {
      appearance: "deep purple", nose: sharedSecond ? ["green pepper"] : ["blackberry", "violet"],
      palate: { sweetness: 1, acidity: 3, tannin: 4, alcohol: 4, body: 4, flavors: sharedSecond ? ["green pepper"] : ["blackberry"] },
      finish: "medium", rating: sharedSecond ? 2 : 4, verdict: sharedSecond ? "disliked" : "liked",
    },
  };
}

type RecommendationCandidate = {
  wine_name: string;
  grape: string;
  region: string;
  style: "red" | "white";
  price_band: "15_30" | "30_60";
  reasoning: string;
};

const PROFILE_CANDIDATES: RecommendationCandidate[] = [
  { wine_name: "Mendoza Malbec", grape: "Malbec", region: "Mendoza", style: "red", price_band: "15_30", reasoning: "Its bold fruit matches this taster's palate." },
  { wine_name: "Etna Rosso", grape: "Nerello Mascalese", region: "Etna", style: "red", price_band: "30_60", reasoning: "Its bright acidity offers a fresh contrast without excessive weight." },
  { wine_name: "Wachau Grüner Veltliner", grape: "Grüner Veltliner", region: "Wachau", style: "white", price_band: "15_30", reasoning: "Its vivid acidity and savory edge make a useful next contrast." },
];

const JOINT_CANDIDATES: RecommendationCandidate[] = [
  { wine_name: "Cru Beaujolais", grape: "Gamay", region: "Beaujolais", style: "red", price_band: "15_30", reasoning: "Both palates favor bright acidity and gentle tannin." },
  { wine_name: "Rioja Reserva", grape: "Tempranillo", region: "Rioja", style: "red", price_band: "30_60", reasoning: "Its balanced fruit, acidity, and polished tannin offer common ground." },
  { wine_name: "Loire Cabernet Franc", grape: "Cabernet Franc", region: "Loire", style: "red", price_band: "15_30", reasoning: "Its freshness and moderate structure bridge both palates." },
];

function recommendationCandidate(trigger: "MOCK:REC" | "MOCK:JOINTREC", options: LanguageModelV2CallOptions): RecommendationCandidate {
  const existing = visibleRecommendationIdentities(options);
  const candidates = trigger === "MOCK:REC" ? PROFILE_CANDIDATES : JOINT_CANDIDATES;
  return candidates.find((candidate) => !existing.has(`${candidate.wine_name.normalize("NFKC").toLocaleLowerCase("en-US")}\u0000`))
    ?? {
      wine_name: `Cellar Discovery ${existing.size + 1}`,
      grape: "Gamay",
      region: "Beaujolais",
      style: "red",
      price_band: "15_30",
      reasoning: "A deterministic alternative after the current recommendation catalog was exhausted.",
    };
}

function toolCalls(trigger: MockTrigger, ids: string[], options: LanguageModelV2CallOptions): Array<{ toolName: string; input: unknown }> {
  const first = ids[0] ?? "missing-participant";
  if (trigger === "MOCK:TASTING") return [{ toolName: "record_tasting_note", input: tastingArgs(first) }];
  if (trigger === "MOCK:REASON") return [{ toolName: "record_tasting_note", input: tastingArgs(first) }];
  if (trigger === "MOCK:LIVE") return [{ toolName: "record_tasting_note", input: tastingArgs(first) }];
  if (trigger === "MOCK:SHARED") return ids.length >= 2
    ? [{ toolName: "record_tasting_note", input: tastingArgs(first) }, { toolName: "record_tasting_note", input: tastingArgs(ids[1] as string, true) }]
    : [{ toolName: "record_tasting_note", input: tastingArgs(first) }];
  if (trigger === "MOCK:PROFILE") return [{ toolName: "update_palate_profile", input: { taster_profile_id: first, tannin: 4, notes: "Enjoys bold reds." } }];
  if (trigger === "MOCK:REC" || trigger === "MOCK:JOINTREC") {
    const candidate = recommendationCandidate(trigger, options);
    return [{ toolName: "save_recommendation", input: { for_profile_id: trigger === "MOCK:REC" ? first : null, ...candidate } }];
  }
  if (trigger === "MOCK:SEARCH") return [{ toolName: "search_wine_availability", input: { query: "Mendoza Malbec", location: "New York NY" } }];
  return [];
}

function responseText(trigger: MockTrigger, options: LanguageModelV2CallOptions): string {
  if (trigger === "MOCK:REC") return `I saved a ${recommendationCandidate(trigger, options).wine_name} as your next-bottle recommendation.`;
  if (trigger === "MOCK:JOINTREC") return `I saved a bottle for both of you: ${recommendationCandidate(trigger, options).wine_name}, based on the overlap in your palates.`;
  return MOCK_SCRIPTS[trigger];
}

function reasoningChunks(id: string, deltas: string[]): LanguageModelV2StreamPart[] {
  return [{ type: "reasoning-start", id }, ...deltas.map((delta): LanguageModelV2StreamPart => ({ type: "reasoning-delta", id, delta })), { type: "reasoning-end", id }];
}

// Stream tool input as start → deltas → end → call so the UI can render a live "running"
// row before the tool executes (specs/04, AC-CHAT-9). Split into several deltas so the
// running window is comfortably observable.
function toolCallChunks(index: number, call: { toolName: string; input: unknown }, parts = 4): LanguageModelV2StreamPart[] {
  const id = `mock-tool-${index + 1}`;
  const input = JSON.stringify(call.input);
  const size = Math.max(1, Math.ceil(input.length / parts));
  const deltas: LanguageModelV2StreamPart[] = [];
  for (let offset = 0; offset < input.length; offset += size) deltas.push({ type: "tool-input-delta", id, delta: input.slice(offset, offset + size) });
  return [
    { type: "tool-input-start", id, toolName: call.toolName },
    ...deltas,
    { type: "tool-input-end", id },
    { type: "tool-call", toolCallId: id, toolName: call.toolName, input },
  ];
}

function textChunks(output: string, id = "mock-text"): LanguageModelV2StreamPart[] {
  const third = Math.max(1, Math.floor(output.length / 3));
  return [
    { type: "text-start", id },
    { type: "text-delta", id, delta: output.slice(0, third) },
    { type: "text-delta", id, delta: output.slice(third, third * 2) },
    { type: "text-delta", id, delta: output.slice(third * 2) },
    { type: "text-end", id },
  ];
}

async function stream(options: LanguageModelV2CallOptions) {
  const latest = latestUserText(options);
  const trigger = triggerFor(latest);
  const hasToolResult = hasToolResultAfterLatestUser(options);
  const calls = trigger ? toolCalls(trigger, participants(options), options) : [];
  const reasoning = trigger ? REASONING_SUMMARIES[trigger] : undefined;
  const preface = trigger ? PREFACES[trigger] : undefined;
  const chunks: LanguageModelV2StreamPart[] = [{ type: "stream-start", warnings: [] }];
  if (trigger === "MOCK:FAIL") {
    let step = 0;
    return { stream: new ReadableStream<LanguageModelV2StreamPart>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        if (step === 0) controller.enqueue({ type: "stream-start", warnings: [] });
        else if (step === 1) controller.enqueue({ type: "text-start", id: "mock-fail" });
        else if (step === 2) controller.enqueue({ type: "text-delta", id: "mock-fail", delta: "I started checking that…" });
        else controller.error(new Error("RAW_PROVIDER_DIAGNOSTIC fixture failure"));
        step += 1;
      },
    }) };
  }
  if (trigger === "MOCK:LONGTRACE") {
    chunks.push(...reasoningChunks("mock-long-trace", Array.from({ length: 80 }, (_, index) => `${String(index + 1).padStart(2, "0")} · checking a safe wine-learning signal\n`)));
    chunks.push(...textChunks(MOCK_SCRIPTS[trigger]));
    chunks.push({ type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 80, totalTokens: 81 } });
    return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 18 }) };
  }
  if (trigger && calls.length && !hasToolResult) {
    // First step: reasoning (if any) → optional preface text → tool calls, deferring the final
    // answer until the tool result returns.
    if (reasoning) chunks.push(...reasoningChunks("mock-reason-1", reasoning.step1));
    if (preface) chunks.push(...textChunks(preface, "mock-preface"));
    // MOCK:LIVE / MOCK:REASON stream a long tool input so the running row and the trace overlay
    // are comfortably observable in e2e.
    const toolParts = trigger === "MOCK:LIVE" || trigger === "MOCK:REASON" ? 14 : 4;
    calls.forEach((call, index) => chunks.push(...toolCallChunks(index, call, toolParts)));
    chunks.push({ type: "finish", finishReason: "tool-calls", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
  } else {
    // Final step: a second reasoning block (interleaved) then the answer text.
    if (reasoning) chunks.push(...reasoningChunks("mock-reason-2", reasoning.step2));
    chunks.push(...textChunks(trigger ? responseText(trigger, options) : `MOCK RESPONSE: ${latest}`));
    chunks.push({ type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } });
  }
  return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 25 }) };
}

async function generate(options: LanguageModelV2CallOptions) {
  const latest = latestUserText(options);
  const trigger = triggerFor(latest);
  const hasToolResult = hasToolResultAfterLatestUser(options);
  const calls = trigger ? toolCalls(trigger, participants(options), options) : [];
  if (trigger && calls.length && !hasToolResult) {
    return {
      content: calls.map((call, index) => ({ type: "tool-call" as const, toolCallId: `mock-tool-${index + 1}`, toolName: call.toolName, input: JSON.stringify(call.input) })),
      finishReason: "tool-calls" as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
    };
  }
  return {
    content: [{ type: "text" as const, text: trigger ? responseText(trigger, options) : `MOCK RESPONSE: ${latest}` }],
    finishReason: "stop" as const, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }, warnings: [],
  };
}

export const mockLanguageModel = new MockLanguageModelV2({ provider: "mock", modelId: "mock-model", doStream: stream, doGenerate: generate });
