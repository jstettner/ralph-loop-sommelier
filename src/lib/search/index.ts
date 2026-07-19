import fs from "node:fs";
import path from "node:path";

export interface SearchResult { title: string; url: string; snippet: string }
export interface SearchProvider { search(query: string): Promise<SearchResult[]> }

export function normalizeSearchQuery(query: string): string {
  return query.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export class FixtureSearchProvider implements SearchProvider {
  async search(query: string): Promise<SearchResult[]> {
    const directory = path.join(process.cwd(), "tests/fixtures/search");
    const keyed = path.join(directory, `${normalizeSearchQuery(query)}.json`);
    const filename = fs.existsSync(keyed) ? keyed : path.join(directory, "default.json");
    return JSON.parse(fs.readFileSync(filename, "utf8")) as SearchResult[];
  }
}

export class NullSearchProvider implements SearchProvider {
  async search(): Promise<SearchResult[]> { return []; }
}

export class TavilySearchProvider implements SearchProvider {
  constructor(private readonly apiKey: string) {}
  async search(query: string): Promise<SearchResult[]> {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: this.apiKey, query, max_results: 5, search_depth: "basic" }),
    });
    if (!response.ok) throw new Error(`Tavily search failed with status ${response.status}.`);
    const payload = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
    return (payload.results ?? []).flatMap((result) => result.title && result.url
      ? [{ title: result.title, url: result.url, snippet: result.content ?? "" }] : []);
  }
}

export function getSearchProvider(): SearchProvider {
  if (process.env.MOCK_LLM === "1") return new FixtureSearchProvider();
  if (process.env.TAVILY_API_KEY) return new TavilySearchProvider(process.env.TAVILY_API_KEY);
  return new NullSearchProvider();
}
