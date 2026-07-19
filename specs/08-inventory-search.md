# 08 — Inventory / Availability Search

"Can I actually buy this near me?" — implemented as web search behind a provider
interface so the product behavior is real while the harness stays deterministic.

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
```

Implementations:

| Impl | When | Behavior |
|---|---|---|
| `TavilySearchProvider` | `TAVILY_API_KEY` set and not `MOCK_LLM` | Calls Tavily's search REST API; maps results. |
| `FixtureSearchProvider` | `MOCK_LLM=1` (always in tests/e2e) | Returns fixtures from `tests/fixtures/search/*.json`, keyed by normalized query with a default fixture fallback. Fixtures include at least one wine-shop-style result (store name "Astor Wines" must appear in the default fixture). |
| `NullSearchProvider` | no key configured | Returns `[]`. |

A single factory `getSearchProvider()` selects the implementation. Nothing outside
`src/lib/search/` constructs providers directly.

## Tool behavior (`search_wine_availability`)

- Args: `query` (what to look for), optional `location` (free text — city or zip; the
  tool composes it into the search query, e.g. `"buy Malbec wine shop near Brooklyn NY"`).
- Returns normalized results to the model, which interprets them conversationally
  ("Astor Wines lists a few Mendoza Malbecs in your range…").
- **Graceful degrade**: with `NullSearchProvider`, the tool returns a structured
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
