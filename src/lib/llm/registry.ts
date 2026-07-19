import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel, Tool } from "ai";
import { mockLanguageModel } from "./mock";

export type NativeSearchProvider = "anthropic" | "openai" | "google";

export interface ModelCapabilities {
  provider: string;
  /** Supports the application's Zod function tools (record/update/save/search). */
  tools: boolean;
  /** Provider can stream visible reasoning summaries when requested. */
  reasoning: boolean;
  /** Exact provider implementation of native web search, or null for none. */
  nativeSearch: NativeSearchProvider | null;
  /** Whether native search can be combined with function tools in one request. */
  nativeSearchCombinesWithTools: boolean;
  /** Anthropic ephemeral prompt-caching breakpoints apply to this model. */
  promptCaching: boolean;
}

export type ModelInfo = { id: string; provider: string; label: string; capabilities: ModelCapabilities };

export class ModelUnavailableError extends Error {
  readonly modelId: string;
  constructor(modelId: string) {
    super(`Model "${modelId}" is not available.`);
    this.name = "ModelUnavailableError";
    this.modelId = modelId;
  }
}

// One map. Adding a hosted provider = one entry here (specs/03). Every provider reads its
// configuration from server-only env; base URLs and keys are never accepted from a request.
const providerFactories = {
  anthropic: {
    label: "Anthropic",
    available: () => Boolean(process.env.ANTHROPIC_API_KEY),
    create: (modelId: string) => createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(modelId),
  },
  openai: {
    label: "OpenAI",
    available: () => Boolean(process.env.OPENAI_API_KEY),
    create: (modelId: string) => createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(modelId),
  },
  google: {
    label: "Google",
    available: () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    create: (modelId: string) => createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(modelId),
  },
  "openai-compatible": {
    label: "Local",
    // Resolves only when the operator configures a base URL. Never client-supplied.
    available: () => Boolean(process.env.OPENAI_COMPATIBLE_BASE_URL),
    create: (modelId: string) => {
      const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL;
      if (!baseURL) throw new ModelUnavailableError(`openai-compatible:${modelId}`);
      return createOpenAICompatible({
        name: "openai-compatible", baseURL, apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      }).chatModel(modelId);
    },
  },
} as const;

type ProviderName = keyof typeof providerFactories;

// Conservative exact-model capability catalog. Enhancement capabilities (reasoning,
// nativeSearch, caching) are opt-in per exact id and never inferred from a provider name.
const CAPABILITY_CATALOG: Record<string, Omit<ModelCapabilities, "provider">> = {
  "anthropic:claude-opus-4-8": { tools: true, reasoning: true, nativeSearch: "anthropic", nativeSearchCombinesWithTools: true, promptCaching: true },
  "anthropic:claude-sonnet-4-6": { tools: true, reasoning: true, nativeSearch: "anthropic", nativeSearchCombinesWithTools: true, promptCaching: true },
  "openai:gpt-5.2": { tools: true, reasoning: true, nativeSearch: "openai", nativeSearchCombinesWithTools: true, promptCaching: false },
  // Gemini grounding cannot be combined with function calling in one request → two-pass route.
  "google:gemini-3.5-flash": { tools: true, reasoning: false, nativeSearch: "google", nativeSearchCombinesWithTools: false, promptCaching: false },
  // Open-weight, self-hosted: function tools only, no native search (uses the shared fallback).
  "openai-compatible:gemma-4-12b-it": { tools: true, reasoning: false, nativeSearch: null, nativeSearchCombinesWithTools: false, promptCaching: false },
};

function baseCapabilities(provider: string): ModelCapabilities {
  return { provider, tools: true, reasoning: false, nativeSearch: null, nativeSearchCombinesWithTools: false, promptCaching: false };
}

export function getModelCapabilities(id: string): ModelCapabilities {
  if (process.env.MOCK_LLM === "1") return baseCapabilities("mock");
  const separator = id.indexOf(":");
  const provider = separator > 0 ? id.slice(0, separator) : id;
  const entry = CAPABILITY_CATALOG[id];
  return entry ? { ...baseCapabilities(provider), ...entry } : baseCapabilities(provider);
}

function configuredIds(): string[] {
  return (process.env.AVAILABLE_MODELS ?? "anthropic:claude-opus-4-8")
    .split(",").map((id) => id.trim()).filter(Boolean);
}

function splitId(id: string): { provider: ProviderName; modelId: string } | null {
  const separator = id.indexOf(":");
  if (separator < 1) return null;
  const provider = id.slice(0, separator) as ProviderName;
  if (!(provider in providerFactories)) return null;
  return { provider, modelId: id.slice(separator + 1) };
}

export function getAvailableModels(): ModelInfo[] {
  if (process.env.MOCK_LLM === "1") {
    return [{ id: "mock:mock-model", provider: "mock", label: "Mock Model", capabilities: baseCapabilities("mock") }];
  }
  return configuredIds().flatMap((id) => {
    const parsed = splitId(id);
    if (!parsed) return [];
    const config = providerFactories[parsed.provider];
    if (!config.available()) return [];
    return [{ id, provider: parsed.provider, label: `${config.label} · ${parsed.modelId}`, capabilities: getModelCapabilities(id) }];
  });
}

export function getModel(id: string): LanguageModel {
  if (process.env.MOCK_LLM === "1") return mockLanguageModel;
  if (!getAvailableModels().some((model) => model.id === id)) throw new ModelUnavailableError(id);
  const parsed = splitId(id);
  if (!parsed) throw new ModelUnavailableError(id);
  const config = providerFactories[parsed.provider];
  if (!config.available()) throw new ModelUnavailableError(id);
  return config.create(parsed.modelId);
}

export function getDefaultModel(): string {
  if (process.env.MOCK_LLM === "1") return "mock:mock-model";
  const available = getAvailableModels();
  const configured = process.env.DEFAULT_MODEL ?? "anthropic:claude-opus-4-8";
  return available.some((model) => model.id === configured) ? configured : available[0]?.id ?? configured;
}

// Native web search is a provider-defined server tool. Construction lives here (the canonical
// registry) so no route imports a provider package directly (specs/03, specs/08).
export function nativeSearchTool(capabilities: ModelCapabilities): Tool | null {
  switch (capabilities.nativeSearch) {
    case "anthropic": return anthropic.tools.webSearch_20250305({ maxUses: 3 }) as Tool;
    case "openai": return openai.tools.webSearch({}) as Tool;
    case "google": return google.tools.googleSearch({}) as Tool;
    default: return null;
  }
}
