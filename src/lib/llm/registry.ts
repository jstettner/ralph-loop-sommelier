import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { mockLanguageModel } from "./mock";

export type ModelInfo = { id: string; provider: string; label: string };

export class ModelUnavailableError extends Error {
  readonly modelId: string;
  constructor(modelId: string) {
    super(`Model "${modelId}" is not available.`);
    this.name = "ModelUnavailableError";
    this.modelId = modelId;
  }
}

const providerFactories = {
  anthropic: {
    key: "ANTHROPIC_API_KEY",
    create: (apiKey: string, modelId: string) => createAnthropic({ apiKey })(modelId),
  },
  openai: {
    key: "OPENAI_API_KEY",
    create: (apiKey: string, modelId: string) => createOpenAI({ apiKey })(modelId),
  },
} as const;

function configuredIds(): string[] {
  return (process.env.AVAILABLE_MODELS ?? "anthropic:claude-opus-4-8")
    .split(",").map((id) => id.trim()).filter(Boolean);
}

export function getAvailableModels(): ModelInfo[] {
  if (process.env.MOCK_LLM === "1") return [{ id: "mock:mock-model", provider: "mock", label: "Mock Model" }];
  return configuredIds().flatMap((id) => {
    const separator = id.indexOf(":");
    if (separator < 1) return [];
    const provider = id.slice(0, separator) as keyof typeof providerFactories;
    const modelId = id.slice(separator + 1);
    const config = providerFactories[provider];
    if (!config || !process.env[config.key]) return [];
    return [{ id, provider, label: `${provider === "openai" ? "OpenAI" : "Anthropic"} · ${modelId}` }];
  });
}

export function getModel(id: string): LanguageModel {
  if (process.env.MOCK_LLM === "1") return mockLanguageModel;
  if (!getAvailableModels().some((model) => model.id === id)) throw new ModelUnavailableError(id);
  const separator = id.indexOf(":");
  const provider = id.slice(0, separator) as keyof typeof providerFactories;
  const modelId = id.slice(separator + 1);
  const config = providerFactories[provider];
  const apiKey = config ? process.env[config.key] : undefined;
  if (!config || !apiKey) throw new ModelUnavailableError(id);
  return config.create(apiKey, modelId);
}

export function getDefaultModel(): string {
  if (process.env.MOCK_LLM === "1") return "mock:mock-model";
  const available = getAvailableModels();
  const configured = process.env.DEFAULT_MODEL ?? "anthropic:claude-opus-4-8";
  return available.some((model) => model.id === configured) ? configured : available[0]?.id ?? configured;
}
