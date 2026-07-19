import { afterEach, describe, expect, it } from "vitest";
import { FixtureSearchProvider, getSearchProvider, NullSearchProvider, TavilySearchProvider } from "../../src/lib/search";

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
