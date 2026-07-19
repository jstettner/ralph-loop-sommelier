import type { LanguageModelV2CallOptions, LanguageModelV2Message, LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV2, simulateReadableStream } from "ai/test";

export const MOCK_SCRIPTS = {
  "MOCK:TASTING": "I recorded the 2022 Malbec for your tasting journal.",
  "MOCK:SHARED": "I recorded separate notes for both tasters—your different reactions are useful palate data.",
  "MOCK:PROFILE": "I updated your palate profile with that preference for bold reds.",
  "MOCK:REC": "I saved a Mendoza Malbec as your next-bottle recommendation.",
  "MOCK:JOINTREC": "I saved a bottle for both of you based on the overlap in your palates.",
  "MOCK:SEARCH": "Astor Wines appears in the availability results for Mendoza Malbec.",
  "MOCK:REASON": "I recorded that tasting after thinking through your acidity history.",
} as const;

type MockTrigger = keyof typeof MOCK_SCRIPTS;

// Provider-visible reasoning summaries only — never a raw internal scratchpad (specs/03).
const REASONING_SUMMARIES: Partial<Record<MockTrigger, { step1: string[]; step2: string[] }>> = {
  "MOCK:REASON": {
    step1: ["Weighing this taster's ", "acidity and tannin history ", "to frame the note…"],
    step2: ["Comparing it to benchmark ", "styles before I answer…"],
  },
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

function toolCalls(trigger: MockTrigger, ids: string[]): Array<{ toolName: string; input: unknown }> {
  const first = ids[0] ?? "missing-participant";
  if (trigger === "MOCK:TASTING") return [{ toolName: "record_tasting_note", input: tastingArgs(first) }];
  if (trigger === "MOCK:REASON") return [{ toolName: "record_tasting_note", input: tastingArgs(first) }];
  if (trigger === "MOCK:SHARED") return ids.length >= 2
    ? [{ toolName: "record_tasting_note", input: tastingArgs(first) }, { toolName: "record_tasting_note", input: tastingArgs(ids[1] as string, true) }]
    : [{ toolName: "record_tasting_note", input: tastingArgs(first) }];
  if (trigger === "MOCK:PROFILE") return [{ toolName: "update_palate_profile", input: { taster_profile_id: first, tannin: 4, notes: "Enjoys bold reds." } }];
  if (trigger === "MOCK:REC") return [{ toolName: "save_recommendation", input: { for_profile_id: first, wine_name: "Mendoza Malbec", grape: "Malbec", region: "Mendoza", style: "red", price_band: "15_30", reasoning: "Its bold fruit matches this taster's palate." } }];
  if (trigger === "MOCK:JOINTREC") return [{ toolName: "save_recommendation", input: { for_profile_id: null, wine_name: "Cru Beaujolais", grape: "Gamay", region: "Beaujolais", style: "red", price_band: "15_30", reasoning: "Both palates favor bright acidity and gentle tannin." } }];
  if (trigger === "MOCK:SEARCH") return [{ toolName: "search_wine_availability", input: { query: "buy Mendoza Malbec", location: "New York NY" } }];
  return [];
}

function reasoningChunks(id: string, deltas: string[]): LanguageModelV2StreamPart[] {
  return [{ type: "reasoning-start", id }, ...deltas.map((delta): LanguageModelV2StreamPart => ({ type: "reasoning-delta", id, delta })), { type: "reasoning-end", id }];
}

// Stream tool input as start → deltas → end → call so the UI can render a live "running"
// row before the tool executes (specs/04, AC-CHAT-9).
function toolCallChunks(index: number, call: { toolName: string; input: unknown }): LanguageModelV2StreamPart[] {
  const id = `mock-tool-${index + 1}`;
  const input = JSON.stringify(call.input);
  const midpoint = Math.max(1, Math.floor(input.length / 2));
  return [
    { type: "tool-input-start", id, toolName: call.toolName },
    { type: "tool-input-delta", id, delta: input.slice(0, midpoint) },
    { type: "tool-input-delta", id, delta: input.slice(midpoint) },
    { type: "tool-input-end", id },
    { type: "tool-call", toolCallId: id, toolName: call.toolName, input },
  ];
}

function textChunks(output: string): LanguageModelV2StreamPart[] {
  const third = Math.max(1, Math.floor(output.length / 3));
  return [
    { type: "text-start", id: "mock-text" },
    { type: "text-delta", id: "mock-text", delta: output.slice(0, third) },
    { type: "text-delta", id: "mock-text", delta: output.slice(third, third * 2) },
    { type: "text-delta", id: "mock-text", delta: output.slice(third * 2) },
    { type: "text-end", id: "mock-text" },
  ];
}

async function stream(options: LanguageModelV2CallOptions) {
  const latest = latestUserText(options);
  const trigger = triggerFor(latest);
  const hasToolResult = hasToolResultAfterLatestUser(options);
  const calls = trigger ? toolCalls(trigger, participants(options)) : [];
  const reasoning = trigger ? REASONING_SUMMARIES[trigger] : undefined;
  const chunks: LanguageModelV2StreamPart[] = [{ type: "stream-start", warnings: [] }];
  if (trigger && calls.length && !hasToolResult) {
    // First step: reasoning (if any) → tool calls, deferring answer text until the tool result returns.
    if (reasoning) chunks.push(...reasoningChunks("mock-reason-1", reasoning.step1));
    calls.forEach((call, index) => chunks.push(...toolCallChunks(index, call)));
    chunks.push({ type: "finish", finishReason: "tool-calls", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
  } else {
    // Final step: a second reasoning block (interleaved) then the answer text.
    if (reasoning) chunks.push(...reasoningChunks("mock-reason-2", reasoning.step2));
    chunks.push(...textChunks(trigger ? MOCK_SCRIPTS[trigger] : `MOCK RESPONSE: ${latest}`));
    chunks.push({ type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } });
  }
  return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 40 }) };
}

async function generate(options: LanguageModelV2CallOptions) {
  const latest = latestUserText(options);
  const trigger = triggerFor(latest);
  const hasToolResult = hasToolResultAfterLatestUser(options);
  const calls = trigger ? toolCalls(trigger, participants(options)) : [];
  if (trigger && calls.length && !hasToolResult) {
    return {
      content: calls.map((call, index) => ({ type: "tool-call" as const, toolCallId: `mock-tool-${index + 1}`, toolName: call.toolName, input: JSON.stringify(call.input) })),
      finishReason: "tool-calls" as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
    };
  }
  return {
    content: [{ type: "text" as const, text: trigger ? MOCK_SCRIPTS[trigger] : `MOCK RESPONSE: ${latest}` }],
    finishReason: "stop" as const, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }, warnings: [],
  };
}

export const mockLanguageModel = new MockLanguageModelV2({ provider: "mock", modelId: "mock-model", doStream: stream, doGenerate: generate });
