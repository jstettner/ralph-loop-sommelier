import { afterEach, describe, expect, it } from "vitest";
import { mockLanguageModel } from "../../src/lib/llm/mock";
import { getAvailableModels, getDefaultModel, getModel, getModelCapabilities, ModelUnavailableError } from "../../src/lib/llm/registry";

const original = { ...process.env };
const managed = [
  "MOCK_LLM", "AVAILABLE_MODELS", "DEFAULT_MODEL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY", "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_API_KEY", "NATIVE_WEB_SEARCH",
];
afterEach(() => {
  for (const key of managed) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
});

describe("model registry", () => {
  it("AC-LLM-1 exposes only models whose provider-required configuration is present", () => {
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
    expect(getAvailableModels()).toEqual([{
      id: "mock:mock-model", provider: "mock", label: "Mock Model",
      capabilities: { provider: "mock", tools: true, reasoning: false, nativeSearch: null, nativeSearchCombinesWithTools: false, promptCaching: false },
    }]);
    expect(getDefaultModel()).toBe("mock:mock-model");
    expect(getModel("anthropic:ignored")).toBe(mockLanguageModel);
    expect(getModelCapabilities("anthropic:claude-opus-4-8").nativeSearch).toBeNull();
  });

  it("AC-LLM-8 admits Anthropic, OpenAI, Google, and operator-hosted OpenAI-compatible models", () => {
    delete process.env.MOCK_LLM;
    process.env.AVAILABLE_MODELS = "anthropic:claude-opus-4-8,openai:gpt-5.2,google:gemini-3.5-flash,openai-compatible:gemma-4-12b-it";
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.OPENAI_API_KEY = "o";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "g";
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;

    // Google appears once its key is present; the compatible model stays hidden until the
    // operator configures a base URL — even though it is allowlisted in AVAILABLE_MODELS.
    expect(getAvailableModels().map((model) => model.provider)).toEqual(["anthropic", "openai", "google"]);
    expect(() => getModel("openai-compatible:gemma-4-12b-it")).toThrow(ModelUnavailableError);

    process.env.OPENAI_COMPATIBLE_BASE_URL = "http://127.0.0.1:1234/v1";
    const ids = getAvailableModels().map((model) => model.id);
    expect(ids).toContain("google:gemini-3.5-flash");
    expect(ids).toContain("openai-compatible:gemma-4-12b-it");
    // Resolving the compatible model uses only the server env base URL; there is no id or
    // argument channel through which a caller could inject or override it.
    expect(getModel("openai-compatible:gemma-4-12b-it")).toBeTruthy();

    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "";
    expect(getAvailableModels().map((model) => model.id)).not.toContain("google:gemini-3.5-flash");
  });

  it("AC-LLM-9 declares native search only for catalogued hosted models, never mock or open-weight", () => {
    delete process.env.MOCK_LLM;
    expect(getModelCapabilities("anthropic:claude-opus-4-8").nativeSearch).toBe("anthropic");
    expect(getModelCapabilities("openai:gpt-5.2").nativeSearch).toBe("openai");
    expect(getModelCapabilities("google:gemini-3.5-flash").nativeSearch).toBe("google");
    expect(getModelCapabilities("google:gemini-3.5-flash").nativeSearchCombinesWithTools).toBe(false);
    expect(getModelCapabilities("openai-compatible:gemma-4-12b-it").nativeSearch).toBeNull();
    expect(getModelCapabilities("openai-compatible:gemma-4-12b-it").tools).toBe(true);
    // An uncatalogued model never optimistically inherits a provider's native capability.
    expect(getModelCapabilities("anthropic:some-future-model").nativeSearch).toBeNull();
    expect(getModelCapabilities("anthropic:some-future-model").promptCaching).toBe(false);
  });
});
