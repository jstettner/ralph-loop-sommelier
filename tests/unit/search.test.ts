import { afterEach, describe, expect, it } from "vitest";
import {
  FixtureSearchProvider, getSearchProvider, NullSearchProvider, resolveSearchRoute,
  TavilySearchProvider, toSearchSources,
} from "../../src/lib/search";

const originalMock = process.env.MOCK_LLM;
const originalKey = process.env.TAVILY_API_KEY;
afterEach(() => {
  if (originalMock === undefined) delete process.env.MOCK_LLM; else process.env.MOCK_LLM = originalMock;
  if (originalKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = originalKey;
});

describe("availability provider factory", () => {
  it("AC-SRCH-1 selects fixture, null, and Tavily providers from environment state", () => {
    process.env.MOCK_LLM = "1";
    expect(getSearchProvider()).toBeInstanceOf(FixtureSearchProvider);
    delete process.env.MOCK_LLM;
    delete process.env.TAVILY_API_KEY;
    expect(getSearchProvider()).toBeInstanceOf(NullSearchProvider);
    process.env.TAVILY_API_KEY = "test-key";
    expect(getSearchProvider()).toBeInstanceOf(TavilySearchProvider);
  });

  it("AC-SRCH-4 resolves a normalized keyed fixture and falls back for unknown queries", async () => {
    const provider = new FixtureSearchProvider();
    const keyed = await provider.search("BUY Mendoza Malbec, New York NY!");
    const fallback = await provider.search("a query with no fixture");
    expect(keyed[0]?.title).toContain("Argentine Malbec");
    expect(fallback[0]?.title).toContain("Astor Wines");
  });
});

describe("search routing", () => {
  it("AC-SRCH-5 prefers native search over Tavily for every declared model, else falls back", () => {
    for (const provider of ["anthropic", "openai", "google"] as const) {
      expect(resolveSearchRoute({ mock: false, nativeWebSearchEnabled: true, nativeSearch: provider, tavilyConfigured: true }))
        .toEqual({ mode: "native", provider });
    }
    // A model with no native capability selects the provider-neutral fallback instead.
    expect(resolveSearchRoute({ mock: false, nativeWebSearchEnabled: true, nativeSearch: null, tavilyConfigured: true }))
      .toEqual({ mode: "tavily" });
  });

  it("AC-SRCH-6 falls back once when native is disabled/unsupported and never networks in mock mode", () => {
    // Disabled native → Tavily when configured, Null when not.
    expect(resolveSearchRoute({ mock: false, nativeWebSearchEnabled: false, nativeSearch: "anthropic", tavilyConfigured: true })).toEqual({ mode: "tavily" });
    expect(resolveSearchRoute({ mock: false, nativeWebSearchEnabled: false, nativeSearch: "anthropic", tavilyConfigured: false })).toEqual({ mode: "null" });
    // Unsupported native (null) with no Tavily → explicit unavailable path.
    expect(resolveSearchRoute({ mock: false, nativeWebSearchEnabled: true, nativeSearch: null, tavilyConfigured: false })).toEqual({ mode: "null" });
    // Mock mode always uses fixtures — regardless of keys or model native metadata.
    expect(resolveSearchRoute({ mock: true, nativeWebSearchEnabled: true, nativeSearch: "anthropic", tavilyConfigured: true })).toEqual({ mode: "fixture" });
    process.env.MOCK_LLM = "1";
    process.env.TAVILY_API_KEY = "should-not-matter";
    expect(getSearchProvider()).toBeInstanceOf(FixtureSearchProvider);
  });

  it("AC-SRCH-7 normalizes sources with server-trusted provenance and collapses duplicate URLs", () => {
    const sources = toSearchSources([
      { title: "Astor Wines", url: "https://example.test/astor/malbec", snippet: "In stock" },
      { title: "Astor Wines (dup)", url: "https://example.test/astor/malbec/", snippet: "duplicate trailing slash" },
      { title: "Not a link", url: "javascript:alert(1)", snippet: "unsafe" },
      { title: "Wine Co", url: "https://shop.test/wine", snippet: "" },
    ], "tavily", "buy malbec near NY");
    expect(sources).toHaveLength(2); // duplicate canonical URL collapsed, non-HTTP dropped
    expect(sources.map((source) => source.url)).toEqual(["https://example.test/astor/malbec", "https://shop.test/wine"]);
    expect(sources.every((source) => source.provider === "tavily" && source.query === "buy malbec near NY")).toBe(true);
  });
});
