import { afterEach, describe, expect, it } from "vitest";
import { mockLanguageModel } from "../../src/lib/llm/mock";
import { getAvailableModels, getDefaultModel, getModel, ModelUnavailableError } from "../../src/lib/llm/registry";

const original = { ...process.env };
afterEach(() => {
  for (const key of ["MOCK_LLM", "AVAILABLE_MODELS", "DEFAULT_MODEL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
});

describe("single model registry", () => {
  it("AC-LLM-1 exposes only configured models backed by provider keys", () => {
    delete process.env.MOCK_LLM;
    process.env.AVAILABLE_MODELS = "anthropic:claude-opus-4-8,openai:gpt-5.2";
    process.env.ANTHROPIC_API_KEY = "anthropic-test";
    delete process.env.OPENAI_API_KEY;
    expect(getAvailableModels().map((model) => model.id)).toEqual(["anthropic:claude-opus-4-8"]);
    process.env.OPENAI_API_KEY = "openai-test";
    expect(getAvailableModels().map((model) => model.id)).toEqual(["anthropic:claude-opus-4-8", "openai:gpt-5.2"]);
  });

  it("AC-LLM-2 throws a typed error for unknown or unavailable ids", () => {
    delete process.env.MOCK_LLM;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getModel("anthropic:not-allowed")).toThrow(ModelUnavailableError);
  });

  it("AC-LLM-3 makes mock mode exclusive and resolves every request without a real provider", () => {
    process.env.MOCK_LLM = "1";
    process.env.ANTHROPIC_API_KEY = "must-not-matter";
    expect(getAvailableModels()).toEqual([{ id: "mock:mock-model", provider: "mock", label: "Mock Model" }]);
    expect(getDefaultModel()).toBe("mock:mock-model");
    expect(getModel("anthropic:ignored")).toBe(mockLanguageModel);
  });
});
