# 08 — Live Web / Inventory Search

Current wine knowledge and "Can I actually buy this near me?" use live web search.
Native model search is preferred when the selected exact model supports it; a shared
provider interface supplies model-independent fallback and keeps the harness deterministic.

## Search routing

For a prompt that meets the live-search scope in specs/03, request assembly follows one
deterministic route:

1. `MOCK_LLM=1` always uses fixtures and can never make a network request.
2. If native search is enabled and supported by the selected exact model, use its
   provider-defined search (`Anthropic web search`, `OpenAI web search`, or
   `Gemini Grounding with Google Search`). Do not also call Tavily on success.
3. If native search is disabled, unsupported, fails, or returns no usable result, use
   `SearchProvider` as the fallback.
4. If neither path is available, return an explicit unavailable result and disclose
   that the answer could not be checked live.

Native search is model-scoped, not provider-scoped: selecting a different conversation
model can change the route. Search is appropriate for changing or externally verifiable
facts, current releases/rules, nearby shops, prices, and availability. It is not invoked
merely to answer stable curriculum or tasting-method questions.

## SearchProvider interface (`src/lib/search/`)

```ts
interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
interface SearchSource extends SearchResult {
  provider: "anthropic" | "openai" | "google" | "tavily" | "fixture";
  query: string;
}
```

`SearchProvider` implementations return the provider-neutral `SearchResult`; routing
validates the URL and adds trusted server-known `provider` and `query` fields to create
the persisted/rendered `SearchSource`. Provider identity is never accepted from model
text or client input.

Implementations:

| Impl | When | Behavior |
|---|---|---|
| `TavilySearchProvider` | Native search did not produce a usable result, `TAVILY_API_KEY` is set, and not `MOCK_LLM` | Calls Tavily's search REST API; maps results. |
| `FixtureSearchProvider` | `MOCK_LLM=1` (always in tests/e2e) | Returns fixtures from `tests/fixtures/search/*.json`, keyed by normalized query with a default fixture fallback. Fixtures include at least one wine-shop-style result (store name "Astor Wines" must appear in the default fixture). |
| `NullSearchProvider` | no key configured | Returns `[]`. |

A single factory `getSearchProvider()` selects the fallback implementation. Nothing
outside `src/lib/search/` constructs fallback providers directly. Native provider tools
are constructed only by the canonical LLM registry/request assembly (specs/03), not by
`src/lib/search/` and not by route handlers.

## Normalized sources and citations

- Both native and fallback results normalize to a safe source shape containing title,
  canonical HTTP(S) URL, snippet when supplied, provider kind, and the query that
  produced it. Provider payloads, tracking metadata, credentials, and hidden reasoning
  are discarded.
- Claims based on live search render nearby source links in the assistant response.
  Native citation/annotation parts are preserved through tool loops and reloads, then
  mapped to the same user-facing source treatment as Tavily results.
- Complete safe source parts persist with the conversation for continuity; the UI never
  renders raw provider JSON. Duplicate canonical URLs collapse to one source in first-use
  order.
- A search result is evidence that a page said something, not proof of present stock or
  price. Availability answers state that inventory can change and link the source rather
  than presenting snippets as a guaranteed retailer feed.

## Fallback tool behavior

`search_web` accepts a query and returns normalized results for current, externally
verifiable questions. `search_wine_availability` adds buying-specific behavior:

- Args: `query` (what to look for), optional `location` (free text — city or zip; the
  tool composes it into the search query, e.g. `"buy Malbec wine shop near Brooklyn NY"`).
- Returns normalized results to the model, which interprets them conversationally
  ("Astor Wines lists a few Mendoza Malbecs in your range…").
- **Graceful degrade**: after native search is unavailable/unsuccessful and the fallback
  is `NullSearchProvider`, the tool returns a structured
  `{ unavailable: true }` marker and the system prompt instructs the model to fall back
  to widely-available general guidance (grape/region/price band + "most wine shops
  carry…") instead of pretending to know local stock. It must never fabricate store
  names or prices when search is unavailable.
- Location: if the user hasn't given a location this conversation, the model asks
  rather than guessing.

## Acceptance criteria

- **AC-SRCH-1**: Provider factory selects Fixture under `MOCK_LLM=1`, Null without a
  key, Tavily with a key (unit — env permutations; Tavily selection asserted without
  network).
- **AC-SRCH-2**: `MOCK:SEARCH` in chat yields an assistant message containing the
  fixture store name (e2e).
- **AC-SRCH-3**: With `NullSearchProvider`, the tool returns the `unavailable` marker
  (integration).
- **AC-SRCH-4**: Fixture provider resolves a keyed query to its fixture file and
  unknown queries to the default fixture (unit).
- **AC-SRCH-5**: Request-routing tests prove native search wins over Tavily for each
  declared Anthropic, OpenAI, and Google model, Tavily is not called after native
  success, and changing to a model without native capability selects fallback (unit).
- **AC-SRCH-6**: Native disabled/failure/empty-result permutations fall back exactly
  once to Fixture/Tavily/Null as configured; mock mode makes zero network calls
  regardless of keys or model metadata (unit/integration).
- **AC-SRCH-7**: Native and fallback search results produce deduplicated persisted source
  parts and visible safe citation links after streaming and reload, without raw provider
  payloads, credentials, tracking metadata, or hidden reasoning (integration/e2e).
- **AC-SRCH-8**: Prompt/request tests prove stable curriculum questions do not search,
  current-fact questions may search, nearby buying asks for missing location, and an
  unavailable path discloses that it was not verified live without inventing stores,
  stock, or prices (unit/integration).
