# Implementation plan

Operator expanded specs 00/03/04/07/08/10 (committed as its own `Spec:` commit).
12 new ACs, coverage 69→81. Real provider paths never run in tests (MOCK_LLM=1); the
deterministic mock is enriched so every behavior is provable offline. Real code paths
(caching, provider options, native-search routing) are covered by pure unit tests.

## Done this session

- [x] Increment A — registry + capabilities (AC-LLM-1 reword, AC-LLM-8, AC-LLM-9 catalog) — committed 031c673
- [x] Increment B — request assembly: Anthropic ephemeral caching (stable-prefix + latest-message
  breakpoint reapplied inline via applyLatestCacheBreakpoint), reasoning provider options, cache
  diagnostics, mock reasoning + streamed tool-input (AC-LLM-6, AC-LLM-7)

## Done this session (continued)

- [x] Increment C — search routing (resolveSearchRoute) + SearchSource dedup + `search_web` tool +
  availability needs-location + native-search tooling (resolveChatTooling, two-pass) + dynamic
  model-aware search-mechanism prompt line (AC-SRCH-5, 6, 7, 8; AC-LLM-9 tooling).
- [x] Increment D — chat UI: progressive text, per-tool lifecycle rows (running→terminal, safe
  summaries, no raw JSON/ids), citation source links persisted across reload (AC-CHAT-9, AC-SRCH-7
  e2e). Mock gained MOCK:LIVE (pre-tool preface + long tool-input for observable running); global
  delay 25ms to keep server load low; fixed a pre-existing logout redirect race in auth e2e.

## Done this session (continued)

- [x] Increment E — NEURAL TRACE overlay (`src/components/neural-trace.tsx` + globals.css): full
  viewport, pointer-transparent, aria-hidden, ~50% warm-white, no opaque backdrop, dissolve+unmount,
  reduced-motion static. Chat drives it from reasoning parts (dissolves at final text; no-reasoning →
  no trace). Dashboard generate now streams a UI message stream; the client consumes it to drive the
  overlay from safe save_recommendation activity, then refreshes cards without reload. Shared
  tool-summary helpers extracted to `src/lib/tool-summary.ts` (AC-CHAT-10, AC-REC-7, AC-UI-12).

## Done — goal complete

- [x] `./verify.sh --done` passes: typecheck, lint, guard, standalone build, unit, integration,
  and Playwright e2e (desktop + mobile) all green; **all 81 acceptance criteria referenced by
  genuine tests**. Verified stable across repeated full e2e runs.

## Key design decisions (from spec + API recon)

- `@ai-sdk/google@^2` + `@ai-sdk/openai-compatible@^1` installed (npm online now; lockfile updated).
- Providers map: anthropic/openai/google/openai-compatible. openai-compatible resolves only when
  `OPENAI_COMPATIBLE_BASE_URL` set AND id allowlisted in AVAILABLE_MODELS; base URL is server-only.
- `getModelCapabilities(id)`: `{ provider, tools, reasoning, nativeSearch: "anthropic"|"openai"|"google"|null,
  nativeSearchCombinesWithTools, promptCaching }`. Conservative exact-model catalog; unknown → false/null.
- Caching: two system messages (stable prefix w/ `providerOptions.anthropic.cacheControl:{type:"ephemeral"}`,
  dynamic memory w/o), `allowSystemInMessages:true`; latest model message gets a breakpoint, re-applied
  in `prepareStep`. Non-anthropic → plain `system` string, no anthropic options. Dashboard: stable-prefix
  breakpoint only (single request, no prepareStep history breakpoint).
- Reasoning: anthropic `providerOptions.anthropic.thinking`; openai reasoning models
  `providerOptions.openai.{reasoningEffort,reasoningSummary}`; mock/unsupported → none.
  Stream reasoning+sources to client via `toUIMessageStreamResponse({sendReasoning:true,sendSources:true})`.
- Native search tools built ONLY in registry/request module: anthropic `tools.webSearch_20250305`,
  openai `tools.webSearch`, google `tools.googleSearch`. Function tools ALWAYS included; when a model
  can't combine native+function tools, run a bounded native search pass then the tool pass.
- Search routing is a pure resolver `resolveSearchRoute({modelId,nativeEnabled,tavilyKey,mock})`:
  mock→fixture(no net); native-capable→native; else fixture/tavily/null; none→unavailable.
- SearchSource adds server-trusted `provider`+`query`; dedup by canonical URL first-use order; persisted
  as tool-result parts; UI renders safe links only (no raw JSON/ids/payloads).
- NEURAL TRACE: fixed full-viewport, pointer-events:none, not in a11y tree, white/warm 45–55% opacity,
  no opaque backdrop; chat driven by reasoning parts (dissolve when final text begins); dashboard driven
  by reasoning OR safe save_recommendation tool activity; reduced-motion = static but readable.
- Mock triggers: existing unchanged; add `MOCK:REASON` (reasoning→tool→reasoning→answer, delayed) for
  chat overlay/reasoning; dashboard REC/JOINTREC drive overlay via tool activity (no-reasoning fallback).

## Discoveries

- 2026-07-19: Operator confirmed (via /goal session) the 6 uncommitted spec edits are authorized;
  committed as `Spec: operator-approved provider expansion...` before implementing. Guard only rejects
  *uncommitted* operator-file changes, so the spec commit clears it.
- 2026-07-19: `@ai-sdk/google` 2.0.82 + `@ai-sdk/openai-compatible` 1.0.46 installed and export the
  expected factories/tools. Native search tools exist: anthropic.tools.webSearch_20250305,
  openai.tools.webSearch, google.tools.googleSearch.
- 2026-07-19: AI SDK v5 supports system-message providerOptions, prepareStep({steps,stepNumber,model,
  messages})→{messages}, readUIMessageStream, and toUIMessageStreamResponse sendReasoning/sendSources.
  allowSystemInMessages defaults to a warning → set true when passing system-in-messages.
- (historical) Completion gate previously passed at 69/69; the prior Done items remain intact.
