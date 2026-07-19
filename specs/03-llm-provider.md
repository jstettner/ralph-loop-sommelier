# 03 — LLM Provider Layer (pluggable models)

The app talks to models exclusively through the **Vercel AI SDK** and a single
**model registry** module: `src/lib/llm/registry.ts`. Nothing else in the codebase may
import a provider package directly.

## Registry contract

- `getAvailableModels(): ModelInfo[]` — parsed from `AVAILABLE_MODELS`
  (`provider:model-id` comma list), filtered to providers whose required configuration
  is present. `ModelInfo` includes `id`, `provider`, `label`, and conservative
  exact-model capabilities for application tools, visible reasoning, and native web
  search. Unknown capabilities are `false`, never optimistically inferred from a
  provider name.
- `getModel(id: string): LanguageModel` — resolves a `provider:model-id` string to an
  AI SDK model instance. Throws a typed error for unknown/unavailable ids.
- `getModelCapabilities(id: string): ModelCapabilities` — returns the same canonical
  capability record used by request assembly and the model selector. Native search is
  represented as `"anthropic" | "openai" | "google" | null`, scoped to the exact
  model id, and separately records whether native search can be combined with the
  application's function tools in one request.
- `getDefaultModel(): string` — `DEFAULT_MODEL`, falling back to the first available.
- Providers: `anthropic` (`@ai-sdk/anthropic`), `openai` (`@ai-sdk/openai`), `google`
  (`@ai-sdk/google`), and `openai-compatible` (`@ai-sdk/openai-compatible`). Adding a
  hosted provider = one entry in one map in this file. Default model remains
  `anthropic:claude-opus-4-8`.

### Open-weight / self-hosted models

- `openai-compatible:*` resolves only when `OPENAI_COMPATIBLE_BASE_URL` is configured;
  its model id must also be explicitly allowlisted in `AVAILABLE_MODELS`. The base URL
  is server/operator configuration and must never be supplied or overridden by a user.
- The Next.js process is an inference client, not a model runtime. Gemma 4 and other
  open-weight models run behind an OpenAI-compatible server such as LM Studio,
  llama.cpp, or vLLM.
- Compatible endpoints vary. A model is exposed to users only after contract tests
  prove streaming text plus every enabled capability. OpenAI-compatible models default
  to application function tools only and **no native web search**; they use the shared
  fallback in specs/08.
- Provider credentials and endpoint URLs remain server-only and never appear in model
  labels, client payloads, persisted message parts, or diagnostics.

## Native web-search capability

Native search is a provider-defined server tool, not an automatic property of sending
a request to a hosted model. Request assembly enables it only when
`NATIVE_WEB_SEARCH != "0"` and the selected exact model's capability record names a
supported implementation:

| Capability | Provider mechanism |
|---|---|
| `anthropic` | Anthropic server-side web search tool |
| `openai` | OpenAI Responses API web-search tool |
| `google` | Gemini Grounding with Google Search |
| `null` | No native tool; use the provider-neutral search path in specs/08 |

- Provider-defined tool construction and provider options stay inside the canonical
  registry/request-assembly module; no route imports provider packages directly.
- The exact-model catalog records tool-combination constraints. If a model cannot mix
  native search with the app's function tools in one call, request assembly performs a
  bounded search pass followed by the normal tool-capable generation pass, preserving
  source metadata. It must never silently drop tasting/profile/recommendation tools.
- Native search is made available to chat for every selected exact model that declares
  the capability. The system prompt scopes its use to information that benefits from freshness or
  external verification: current wine facts, changing rules or releases, nearby shops,
  availability, and prices. Stable tasting instruction and ordinary curriculum answers
  use model knowledge plus local memory without searching.
- Native search is the primary live-search path. Tavily is attempted only when native
  search is disabled, unsupported, or returns a provider/tool failure or no usable
  results. Search behavior, citations, persistence, and graceful degradation are
  specified in specs/08.

## Mock provider (the harness linchpin)

When `MOCK_LLM=1`:

- The registry exposes exactly one model: `mock:mock-model`, and `getModel` returns the
  deterministic mock regardless of the id requested. No network calls are possible.
- The mock is a custom AI SDK `LanguageModel` implementation (use the AI SDK's test/mock
  language-model utilities from the `ai` package as the base) living in
  `src/lib/llm/mock.ts`.
- Behavior is keyed on the **latest user message text** (script table lives beside the
  mock; tests import the same table):

| Trigger substring | Mock behavior |
|---|---|
| `MOCK:TASTING` | Calls `record_tasting_note` for the **first participant** with fixed args (a 2022 Malbec, verdict "liked", nose ["blackberry","violet"], rating 4), then streams a short confirmation text. |
| `MOCK:SHARED` | Calls `record_tasting_note` **twice against the same wine** — once per each of the conversation's first two participants, with different fixed args (participant 1: rating 4, verdict "liked"; participant 2: rating 2, verdict "disliked", nose ["green pepper"]) — then streams a confirmation naming both tasters. Requires ≥2 participants; with 1 it behaves like `MOCK:TASTING`. |
| `MOCK:PROFILE` | Calls `update_palate_profile` for the first participant with fixed args (tannin 4, notes mention "bold reds"), then streams confirmation. |
| `MOCK:REC` | Calls `save_recommendation` for the first participant with the first candidate absent from `CURRENT VISIBLE RECOMMENDATIONS` (deterministic order starts Mendoza Malbec, then Etna Rosso), then streams confirmation naming the selected wine. |
| `MOCK:JOINTREC` | Calls `save_recommendation` for a **joint** recommendation (profile_id null — "for both of you") with the first absent joint candidate (deterministic order starts Cru Beaujolais, then Rioja Reserva), then streams confirmation naming the selected wine. |
| `MOCK:SEARCH` | Calls `search_wine_availability` with a fixed query, then streams a text that includes the fixture result's store name. |
| anything else | Streams `MOCK RESPONSE: ` + the user text. No tool calls. |

- After any tool result returns, the mock streams a final text turn (so the chat UI
  always ends with assistant text).

## Model selection UX

- The chat UI shows a model selector listing `getAvailableModels()`.
- The chosen model is stored on the conversation row and used for all its turns.
- New conversations default to `getDefaultModel()`.

## Anthropic prompt caching

Real Anthropic calls use Anthropic's explicit prompt-caching breakpoints through AI
SDK `providerOptions.anthropic.cacheControl = { type: "ephemeral" }`. `ephemeral` is
the cache policy, not an application-supplied cache key: Anthropic derives cache
identity from the exact prompt prefix.

- Prompt assembly separates the stable system prefix (persona, teaching method, and
  seeded curriculum) from dynamic per-profile memory. The stable prefix comes first
  and ends at an ephemeral cache breakpoint.
- Chat also places an ephemeral breakpoint on the latest model message for incremental
  reuse of the growing conversation prefix. The breakpoint is reapplied for every
  agent/tool step (AI SDK `prepareStep` or its supported equivalent), so tool loops do
  not silently lose caching.
- Dashboard recommendation generation uses the stable-prefix breakpoint; it has no
  conversation-history breakpoint because it is a single generated request.
- Cache-control metadata is provider-specific: OpenAI and the deterministic mock must
  not receive Anthropic provider options. Caching must not change prompt contents,
  tool availability, model selection, or deterministic mock behavior.
- Cache creation/read token counts returned in Anthropic provider metadata are emitted
  to structured server diagnostics so operators can confirm cache hits and measure
  whether caching is beneficial. No prompt or user-memory content is logged with
  these metrics.

## Visible reasoning summaries

The app requests and streams provider-visible reasoning summaries when the selected
model supports them. This is explicitly **not** a promise of private/raw chain of
thought: providers may summarize, redact, omit, or decline to produce reasoning, and
the UI must describe the content as a `NEURAL TRACE`, never as a verbatim internal
scratchpad.

- Anthropic models use their supported thinking mode. The default Claude Opus 4.8
  uses adaptive thinking with `display: "summarized"` and an operator-configurable
  effort; models that support manual thinking use their compatible configuration.
- OpenAI reasoning models use the Responses API reasoning-summary option at the
  richest supported level. Non-reasoning models receive no unsupported options.
- AI SDK reasoning parts stream end-to-end through the same `UIMessage` response as
  assistant text and tool parts. Complete, unmodified reasoning/redacted-thinking
  protocol parts required for provider continuity remain available to the model loop,
  while only provider-visible summary text may reach the visual trace.
- A model may skip reasoning for a simple turn. The app never fabricates reasoning
  text to keep the effect busy; streamed safe tool activity is the fallback signal.
- The deterministic mock provides delayed reasoning-summary chunks, including a
  reasoning → tool → reasoning → answer script, so browser behavior is testable
  without network access.

## Optional real-model evals

`npm run eval:llm` is an explicit, paid quality lane outside `verify.sh`. It uses the
canonical registry, production recommendation prompt assembly, and production tool
schema with a pinned inexpensive Anthropic model. It requires `ANTHROPIC_API_KEY` and
fails clearly when credentials are absent; deterministic unit/integration/e2e tests
remain network-free under `MOCK_LLM=1` and never skip based on provider availability.

The initial eval set checks two behaviors that deterministic tests cannot establish
about a real model: it avoids every wine in `CURRENT VISIBLE RECOMMENDATIONS`, and when
the persistence tool returns `duplicate=true, retry=true`, it makes a bounded second
tool call with a different wine. The command exits nonzero on a failed assertion and
prints the model id, selected wines, and token usage so quality and cost are observable.

## Acceptance criteria

- **AC-LLM-1**: Registry lists only models whose provider-required server configuration
  is present (unit — env permutations).
- **AC-LLM-2**: `getModel` on an unknown id throws the typed error; the chat API maps
  it to a 400 (integration).
- **AC-LLM-3**: With `MOCK_LLM=1`, the registry exposes only the mock and never
  constructs a real provider (unit).
- **AC-LLM-4**: Each mock trigger produces its scripted tool call followed by
  assistant text (integration, via the chat route).
- **AC-LLM-5**: The conversation persists its selected model and the selector shows
  the available list (e2e sees the mock model listed).
- **AC-LLM-6**: Request-assembly tests prove that Anthropic chat and dashboard
  recommendation calls apply an ephemeral breakpoint after the stable system prefix,
  chat reapplies a latest-message breakpoint across agent/tool steps, OpenAI/mock calls
  receive no Anthropic cache metadata, and cache metrics diagnostics contain counts but
  no prompt or memory content (unit).
- **AC-LLM-7**: Provider-option tests prove compatible Anthropic and OpenAI reasoning
  models request visible summaries, unsupported/mock calls receive no foreign-provider
  options, provider protocol parts survive tool loops unmodified, and the deterministic
  mock emits delayed interleaved reasoning parts without labeling them raw chain of
  thought (unit/integration).
- **AC-LLM-8**: Registry permutation tests cover configured Anthropic, OpenAI, Google,
  and OpenAI-compatible models; the latter requires an operator base URL, never accepts
  a client-supplied URL, and a representative Gemma 4 fixture proves streaming plus all
  enabled application tool contracts (unit/integration).
- **AC-LLM-9**: Exact-model capability tests prove native search is enabled only for
  declared Anthropic/OpenAI/Google models, is absent from mock and OpenAI-compatible
  models, respects `NATIVE_WEB_SEARCH=0`, and never causes application function tools
  to disappear when a provider restricts tool combinations (unit).
