import type { ModelMessage } from "ai";
import type { ModelCapabilities, NativeSearchProvider } from "./registry";
import { buildDynamicContext, buildStableSystemPrefix } from "./system-prompt";

type ProviderOptions = NonNullable<ModelMessage["providerOptions"]>;

// `ephemeral` is Anthropic's cache POLICY, not an app-supplied key: cache identity is the
// exact prompt prefix. OpenAI/Google/compatible/mock must never receive these options.
const EPHEMERAL: ProviderOptions = { anthropic: { cacheControl: { type: "ephemeral" } } };

function setCacheControl(message: ModelMessage, on: boolean): ModelMessage {
  const anthropic: Record<string, unknown> = { ...(message.providerOptions?.anthropic as Record<string, unknown> | undefined) };
  if (on) anthropic.cacheControl = { type: "ephemeral" };
  else delete anthropic.cacheControl;
  const providerOptions: Record<string, unknown> = { ...message.providerOptions };
  if (Object.keys(anthropic).length) providerOptions.anthropic = anthropic;
  else delete providerOptions.anthropic;
  return { ...message, providerOptions: providerOptions as ProviderOptions } as ModelMessage;
}

// Keep an ephemeral breakpoint on the latest non-system message so the growing conversation
// prefix stays cached; re-applied every agent/tool step so tool loops don't lose caching.
// Anthropic allows few breakpoints, so the marker moves rather than accumulating.
export function applyLatestCacheBreakpoint(messages: ModelMessage[], capabilities: ModelCapabilities): ModelMessage[] {
  if (!capabilities.promptCaching || messages.length === 0) return messages;
  let lastNonSystemIndex = -1;
  messages.forEach((message, index) => { if (message.role !== "system") lastNonSystemIndex = index; });
  return messages.map((message, index) =>
    message.role === "system" ? message : setCacheControl(message, index === lastNonSystemIndex));
}

function reasoningEffort(): "low" | "medium" | "high" {
  const value = process.env.REASONING_EFFORT;
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

// Provider-visible reasoning summaries — never a promise of raw chain of thought (specs/03).
export function reasoningProviderOptions(capabilities: ModelCapabilities): ProviderOptions | undefined {
  if (!capabilities.reasoning) return undefined;
  if (capabilities.provider === "anthropic") return { anthropic: { thinking: { type: "adaptive", display: "summarized" } } };
  if (capabilities.provider === "openai") return { openai: { reasoningEffort: reasoningEffort(), reasoningSummary: "detailed" } };
  return undefined;
}

export interface AssembledRequest {
  system?: string;
  messages: ModelMessage[];
  providerOptions?: ProviderOptions;
  /** True when the caller should reapply the latest-message cache breakpoint each step
   *  (chat only). Built inline at the call site via applyLatestCacheBreakpoint so the
   *  tool-set generic infers correctly. */
  cacheBreakpoints?: boolean;
  allowSystemInMessages?: boolean;
}

function stableSystemMessages(stable: string, dynamic: string): ModelMessage[] {
  return [
    { role: "system", content: stable, providerOptions: EPHEMERAL },
    { role: "system", content: dynamic },
  ];
}

export interface ChatToolingPlan {
  /** Native provider search to attach to the request, or null. */
  nativeSearch: NativeSearchProvider | null;
  /** Native search is enabled but cannot share one request with function tools → a bounded
   *  native search pass runs first, then the normal tool-capable generation pass. */
  twoPass: boolean;
  /** The application's function tools are ALWAYS present; native search never displaces them. */
  includeFunctionTools: true;
}

export function resolveChatTooling(capabilities: ModelCapabilities, nativeWebSearchEnabled: boolean): ChatToolingPlan {
  const useNative = nativeWebSearchEnabled && capabilities.nativeSearch !== null;
  return {
    nativeSearch: useNative ? capabilities.nativeSearch : null,
    twoPass: useNative && !capabilities.nativeSearchCombinesWithTools,
    includeFunctionTools: true,
  };
}

export function nativeWebSearchEnabled(): boolean {
  return process.env.NATIVE_WEB_SEARCH !== "0";
}

export interface ChatRequestParams {
  capabilities: ModelCapabilities;
  participantMemory: string;
  curriculum: string;
  shared: boolean;
  modelMessages: ModelMessage[];
  /** Whether native web search is active for this exact model, so the dynamic context can
   *  tell the model which search mechanism it actually has. */
  nativeSearchActive: boolean;
}

export function buildChatRequest(params: ChatRequestParams): AssembledRequest {
  const { capabilities, participantMemory, curriculum, shared, modelMessages, nativeSearchActive } = params;
  const stable = buildStableSystemPrefix(curriculum);
  const dynamic = buildDynamicContext(participantMemory, shared, nativeSearchActive);
  const providerOptions = reasoningProviderOptions(capabilities);
  if (capabilities.promptCaching) {
    const messages = [...stableSystemMessages(stable, dynamic), ...modelMessages];
    return {
      messages: applyLatestCacheBreakpoint(messages, capabilities),
      ...(providerOptions ? { providerOptions } : {}),
      allowSystemInMessages: true,
      cacheBreakpoints: true,
    };
  }
  return { system: `${stable}\n\n${dynamic}`, messages: modelMessages, ...(providerOptions ? { providerOptions } : {}) };
}

export interface RecommendationRequestParams {
  capabilities: ModelCapabilities;
  participantMemory: string;
  curriculum: string;
  shared: boolean;
  prompt: string;
}

export function buildRecommendationRequest(params: RecommendationRequestParams): AssembledRequest {
  const { capabilities, participantMemory, curriculum, shared, prompt } = params;
  const stable = buildStableSystemPrefix(curriculum);
  // Dashboard recommendation generation does no web search — only save_recommendation runs.
  const dynamic = buildDynamicContext(participantMemory, shared, false);
  const providerOptions = reasoningProviderOptions(capabilities);
  // Single generated request: stable-prefix breakpoint only, no conversation-history breakpoint.
  if (capabilities.promptCaching) {
    return {
      messages: [...stableSystemMessages(stable, dynamic), { role: "user", content: prompt }],
      ...(providerOptions ? { providerOptions } : {}),
      allowSystemInMessages: true,
    };
  }
  return { system: `${stable}\n\n${dynamic}`, messages: [{ role: "user", content: prompt }], ...(providerOptions ? { providerOptions } : {}) };
}
