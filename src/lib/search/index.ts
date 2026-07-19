import fs from "node:fs";
import path from "node:path";

export interface SearchResult { title: string; url: string; snippet: string }

export type SearchProviderKind = "anthropic" | "openai" | "google" | "tavily" | "fixture";

// A provider-neutral result plus server-trusted provenance. `provider` and `query` are
// stamped by routing from server-known state — never accepted from model text or clients.
export interface SearchSource extends SearchResult { provider: SearchProviderKind; query: string }

export interface SearchProvider {
  readonly kind: "tavily" | "fixture" | "null";
  search(query: string): Promise<SearchResult[]>;
}

export function normalizeSearchQuery(query: string): string {
  return query.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Dedup key: scheme + host (lower) + path (no trailing slash) + query string. Non-HTTP(S) URLs
// are rejected so nothing but a safe, linkable source is ever persisted or rendered.
function canonicalKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`;
  } catch {
    return null;
  }
}

export function toSearchSources(results: SearchResult[], provider: SearchProviderKind, query: string): SearchSource[] {
  const seen = new Set<string>();
  const sources: SearchSource[] = [];
  for (const result of results) {
    const key = canonicalKey(result.url);
    if (!key || seen.has(key)) continue; // drop non-HTTP(S) and duplicate canonical URLs (first-use order)
    seen.add(key);
    sources.push({ title: result.title, url: result.url, snippet: result.snippet, provider, query });
  }
  return sources;
}

export class FixtureSearchProvider implements SearchProvider {
  readonly kind = "fixture" as const;
  async search(query: string): Promise<SearchResult[]> {
    const directory = path.join(process.cwd(), "tests/fixtures/search");
    const keyed = path.join(directory, `${normalizeSearchQuery(query)}.json`);
    const filename = fs.existsSync(keyed) ? keyed : path.join(directory, "default.json");
    return JSON.parse(fs.readFileSync(filename, "utf8")) as SearchResult[];
  }
}

export class NullSearchProvider implements SearchProvider {
  readonly kind = "null" as const;
  async search(): Promise<SearchResult[]> { return []; }
}

export class TavilySearchProvider implements SearchProvider {
  readonly kind = "tavily" as const;
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

// The fallback provider (specs/08). Native provider search is constructed in the LLM
// registry, never here and never in route handlers.
export function getSearchProvider(): SearchProvider {
  if (process.env.MOCK_LLM === "1") return new FixtureSearchProvider();
  if (process.env.TAVILY_API_KEY) return new TavilySearchProvider(process.env.TAVILY_API_KEY);
  return new NullSearchProvider();
}

export type SearchRoute =
  | { mode: "native"; provider: "anthropic" | "openai" | "google" }
  | { mode: "fixture" }
  | { mode: "tavily" }
  | { mode: "null" };

export interface SearchRouteInput {
  mock: boolean;
  nativeWebSearchEnabled: boolean;
  nativeSearch: "anthropic" | "openai" | "google" | null;
  tavilyConfigured: boolean;
}

// One deterministic route (specs/08): mock never touches the network; a native-capable exact
// model wins over Tavily; otherwise the provider-neutral fallback (tavily → null).
export function resolveSearchRoute(input: SearchRouteInput): SearchRoute {
  if (input.mock) return { mode: "fixture" };
  if (input.nativeWebSearchEnabled && input.nativeSearch) return { mode: "native", provider: input.nativeSearch };
  if (input.tavilyConfigured) return { mode: "tavily" };
  return { mode: "null" };
}
