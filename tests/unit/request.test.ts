import type { ModelMessage } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { buildCacheDiagnostics } from "../../src/lib/llm/diagnostics";
import type { ModelCapabilities } from "../../src/lib/llm/registry";
import { applyLatestCacheBreakpoint, buildChatRequest, buildRecommendationRequest, nativeWebSearchEnabled, resolveChatTooling } from "../../src/lib/llm/request";

const anthropic: ModelCapabilities = { provider: "anthropic", tools: true, reasoning: true, nativeSearch: "anthropic", nativeSearchCombinesWithTools: true, promptCaching: true };
const openai: ModelCapabilities = { provider: "openai", tools: true, reasoning: true, nativeSearch: "openai", nativeSearchCombinesWithTools: true, promptCaching: false };
const mock: ModelCapabilities = { provider: "mock", tools: true, reasoning: false, nativeSearch: null, nativeSearchCombinesWithTools: false, promptCaching: false };

const MEMORY = "TASTER MEMORY\n\nPARTICIPANT profile-x | Alex";
const CURRICULUM = "CURRICULUM\n\n- Gamay: bright and light.";
const userMessages: ModelMessage[] = [{ role: "user", content: "Teach me about tannin" }];

function cacheControl(message: ModelMessage | undefined): unknown {
  return (message?.providerOptions?.anthropic as { cacheControl?: unknown } | undefined)?.cacheControl;
}

const originalEffort = process.env.REASONING_EFFORT;
afterEach(() => {
  if (originalEffort === undefined) delete process.env.REASONING_EFFORT; else process.env.REASONING_EFFORT = originalEffort;
});

describe("Anthropic prompt caching (AC-LLM-6)", () => {
  it("AC-LLM-6 breaks the cache after the stable prefix and on the latest chat message", () => {
    const assembled = buildChatRequest({ capabilities: anthropic, participantMemory: MEMORY, curriculum: CURRICULUM, shared: false, modelMessages: userMessages, nativeSearchActive: false });
    const [stable, dynamic, latest] = assembled.messages;
    expect(stable?.role).toBe("system");
    expect(stable?.content).toContain("sommelier-tutor");
    expect(stable?.content).toContain(CURRICULUM);
    expect(cacheControl(stable)).toEqual({ type: "ephemeral" });
    // Dynamic per-profile memory sits AFTER the breakpoint and is never cached.
    expect(dynamic?.role).toBe("system");
    expect(dynamic?.content).toContain(MEMORY);
    expect(cacheControl(dynamic)).toBeUndefined();
    // The latest model message carries the incremental conversation-prefix breakpoint.
    expect(cacheControl(latest)).toEqual({ type: "ephemeral" });
    expect(assembled.allowSystemInMessages).toBe(true);
    expect(assembled.cacheBreakpoints).toBe(true);
  });

  it("AC-LLM-6 reapplies the latest-message breakpoint across agent/tool steps", () => {
    const assembled = buildChatRequest({ capabilities: anthropic, participantMemory: MEMORY, curriculum: CURRICULUM, shared: false, modelMessages: userMessages, nativeSearchActive: false });
    // A subsequent tool step appends assistant + tool messages, exactly as the chat route reapplies it.
    const stepMessages: ModelMessage[] = [
      ...assembled.messages,
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "record_tasting_note", input: {} }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "record_tasting_note", output: { type: "json", value: { saved: true } } }] },
    ];
    const next = applyLatestCacheBreakpoint(stepMessages, anthropic);
    expect(cacheControl(next[0])).toEqual({ type: "ephemeral" }); // stable system retained
    expect(cacheControl(next[next.length - 1])).toEqual({ type: "ephemeral" }); // moved to new last (tool result)
    // The previously-latest user message no longer holds the marker — breakpoints move, not accumulate.
    const priorUser = next.find((message) => message.role === "user");
    expect(cacheControl(priorUser)).toBeUndefined();
  });

  it("AC-LLM-6 gives dashboard generation only the stable-prefix breakpoint, no history breakpoint", () => {
    const assembled = buildRecommendationRequest({ capabilities: anthropic, participantMemory: MEMORY, curriculum: CURRICULUM, shared: true, prompt: "Suggest a bottle" });
    expect(cacheControl(assembled.messages[0])).toEqual({ type: "ephemeral" });
    expect(assembled.cacheBreakpoints).toBeUndefined();
    const userMessage = assembled.messages.find((message) => message.role === "user");
    expect(cacheControl(userMessage)).toBeUndefined();
  });

  it("AC-LLM-6 never sends Anthropic cache options to OpenAI or the mock", () => {
    for (const capabilities of [openai, mock]) {
      const assembled = buildChatRequest({ capabilities, participantMemory: MEMORY, curriculum: CURRICULUM, shared: false, modelMessages: userMessages, nativeSearchActive: false });
      expect(typeof assembled.system).toBe("string");
      expect(assembled.cacheBreakpoints).toBeUndefined();
      expect(assembled.allowSystemInMessages).toBeUndefined();
      for (const message of assembled.messages) expect(message.providerOptions?.anthropic).toBeUndefined();
    }
  });

  it("AC-LLM-6 emits cache diagnostics with counts only — no prompt or memory content", () => {
    const diagnostics = buildCacheDiagnostics("anthropic:claude-opus-4-8", { anthropic: { cacheCreationInputTokens: 1200, cacheReadInputTokens: 800 } });
    expect(diagnostics).toEqual({ model: "anthropic:claude-opus-4-8", cacheCreationInputTokens: 1200, cacheReadInputTokens: 800 });
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("PARTICIPANT");
    expect(serialized).not.toContain("Alex");
    expect(serialized).not.toContain("Gamay");
    expect(buildCacheDiagnostics("openai:gpt-5.2", { openai: {} })).toBeNull();
    expect(buildCacheDiagnostics("mock:mock-model", undefined)).toBeNull();
  });
});

describe("visible reasoning provider options (AC-LLM-7)", () => {
  it("AC-LLM-7 requests summarized thinking for Anthropic and reasoning summaries for OpenAI", () => {
    process.env.REASONING_EFFORT = "high";
    const anthropicRequest = buildChatRequest({ capabilities: anthropic, participantMemory: MEMORY, curriculum: CURRICULUM, shared: false, modelMessages: userMessages, nativeSearchActive: false });
    expect(anthropicRequest.providerOptions?.anthropic).toEqual({ thinking: { type: "adaptive", display: "summarized" } });
    const openaiRequest = buildChatRequest({ capabilities: openai, participantMemory: MEMORY, curriculum: CURRICULUM, shared: false, modelMessages: userMessages, nativeSearchActive: false });
    expect(openaiRequest.providerOptions?.openai).toEqual({ reasoningEffort: "high", reasoningSummary: "detailed" });
  });

  it("AC-LLM-7 sends no reasoning options to the mock or non-reasoning models", () => {
    const google: ModelCapabilities = { provider: "google", tools: true, reasoning: false, nativeSearch: "google", nativeSearchCombinesWithTools: false, promptCaching: false };
    for (const capabilities of [mock, google]) {
      const assembled = buildChatRequest({ capabilities, participantMemory: MEMORY, curriculum: CURRICULUM, shared: false, modelMessages: userMessages, nativeSearchActive: false });
      expect(assembled.providerOptions).toBeUndefined();
    }
  });
});

describe("native search tooling (AC-LLM-9)", () => {
  const google: ModelCapabilities = { provider: "google", tools: true, reasoning: false, nativeSearch: "google", nativeSearchCombinesWithTools: false, promptCaching: false };
  const compatible: ModelCapabilities = { provider: "openai-compatible", tools: true, reasoning: false, nativeSearch: null, nativeSearchCombinesWithTools: false, promptCaching: false };

  it("AC-LLM-9 attaches native search only for declared models and never drops function tools", () => {
    expect(resolveChatTooling(anthropic, true)).toEqual({ nativeSearch: "anthropic", twoPass: false, includeFunctionTools: true });
    // Google can't combine native search with function tools → two-pass, but function tools stay.
    expect(resolveChatTooling(google, true)).toEqual({ nativeSearch: "google", twoPass: true, includeFunctionTools: true });
    // Mock and open-weight models get no native search; function tools remain.
    for (const capabilities of [mock, compatible]) {
      const plan = resolveChatTooling(capabilities, true);
      expect(plan.nativeSearch).toBeNull();
      expect(plan.includeFunctionTools).toBe(true);
    }
    // NATIVE_WEB_SEARCH disabled removes native search without touching function tools.
    expect(resolveChatTooling(anthropic, false)).toEqual({ nativeSearch: null, twoPass: false, includeFunctionTools: true });
  });

  it("AC-LLM-9 reads NATIVE_WEB_SEARCH=0 as a global native-search disable", () => {
    const original = process.env.NATIVE_WEB_SEARCH;
    try {
      process.env.NATIVE_WEB_SEARCH = "0";
      expect(nativeWebSearchEnabled()).toBe(false);
      process.env.NATIVE_WEB_SEARCH = "1";
      expect(nativeWebSearchEnabled()).toBe(true);
      delete process.env.NATIVE_WEB_SEARCH;
      expect(nativeWebSearchEnabled()).toBe(true);
    } finally {
      if (original === undefined) delete process.env.NATIVE_WEB_SEARCH; else process.env.NATIVE_WEB_SEARCH = original;
    }
  });
});
