import type { LanguageModelV2CallOptions, LanguageModelV2Message, LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV2, simulateReadableStream } from "ai/test";

export const MOCK_SCRIPTS = {
  "MOCK:TASTING": "I recorded the 2022 Malbec for your tasting journal.",
  "MOCK:SHARED": "I recorded separate notes for both tasters—your different reactions are useful palate data.",
  "MOCK:PROFILE": "I updated your palate profile with that preference for bold reds.",
  "MOCK:REC": "I saved a Mendoza Malbec as your next-bottle recommendation.",
  "MOCK:JOINTREC": "I saved a bottle for both of you based on the overlap in your palates.",
  "MOCK:SEARCH": "Astor Wines appears in the availability results for Mendoza Malbec.",
} as const;

type MockTrigger = keyof typeof MOCK_SCRIPTS;

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
  if (trigger === "MOCK:SHARED") return ids.length >= 2
    ? [{ toolName: "record_tasting_note", input: tastingArgs(first) }, { toolName: "record_tasting_note", input: tastingArgs(ids[1] as string, true) }]
    : [{ toolName: "record_tasting_note", input: tastingArgs(first) }];
  if (trigger === "MOCK:PROFILE") return [{ toolName: "update_palate_profile", input: { taster_profile_id: first, tannin: 4, notes: "Enjoys bold reds." } }];
  if (trigger === "MOCK:REC") return [{ toolName: "save_recommendation", input: { for_profile_id: first, wine_name: "Mendoza Malbec", grape: "Malbec", region: "Mendoza", style: "red", price_band: "15_30", reasoning: "Its bold fruit matches this taster's palate." } }];
  if (trigger === "MOCK:JOINTREC") return [{ toolName: "save_recommendation", input: { for_profile_id: null, wine_name: "Cru Beaujolais", grape: "Gamay", region: "Beaujolais", style: "red", price_band: "15_30", reasoning: "Both palates favor bright acidity and gentle tannin." } }];
  if (trigger === "MOCK:SEARCH") return [{ toolName: "search_wine_availability", input: { query: "buy Mendoza Malbec", location: "New York NY" } }];
  return [];
}

async function stream(options: LanguageModelV2CallOptions) {
  const latest = latestUserText(options);
  const trigger = triggerFor(latest);
  const hasToolResult = options.prompt.some((message) => message.role === "tool");
  const calls = trigger ? toolCalls(trigger, participants(options)) : [];
  let chunks: LanguageModelV2StreamPart[];
  if (trigger && calls.length && !hasToolResult) {
    chunks = [
      { type: "stream-start", warnings: [] },
      ...calls.map((call, index): LanguageModelV2StreamPart => ({ type: "tool-call", toolCallId: `mock-tool-${index + 1}`, toolName: call.toolName, input: JSON.stringify(call.input) })),
      { type: "finish", finishReason: "tool-calls", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    ];
  } else {
    const output = trigger ? MOCK_SCRIPTS[trigger] : `MOCK RESPONSE: ${latest}`;
    const midpoint = Math.max(1, Math.floor(output.length / 2));
    chunks = [
      { type: "stream-start", warnings: [] }, { type: "text-start", id: "mock-text" },
      { type: "text-delta", id: "mock-text", delta: output.slice(0, midpoint) },
      { type: "text-delta", id: "mock-text", delta: output.slice(midpoint) },
      { type: "text-end", id: "mock-text" },
      { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
    ];
  }
  return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 25 }) };
}

export const mockLanguageModel = new MockLanguageModelV2({ provider: "mock", modelId: "mock-model", doStream: stream });
