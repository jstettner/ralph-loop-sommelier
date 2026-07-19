# 03 — LLM Provider Layer (pluggable models)

The app talks to models exclusively through the **Vercel AI SDK** and a single
**model registry** module: `src/lib/llm/registry.ts`. Nothing else in the codebase may
import a provider package directly.

## Registry contract

- `getAvailableModels(): ModelInfo[]` — parsed from `AVAILABLE_MODELS`
  (`provider:model-id` comma list), filtered to providers whose API key env var is
  present. `ModelInfo = { id: string; provider: string; label: string }`.
- `getModel(id: string): LanguageModel` — resolves a `provider:model-id` string to an
  AI SDK model instance. Throws a typed error for unknown/unavailable ids.
- `getDefaultModel(): string` — `DEFAULT_MODEL`, falling back to the first available.
- Providers wired in v1: `anthropic` (`@ai-sdk/anthropic`), `openai` (`@ai-sdk/openai`).
  Adding a provider = one entry in one map in this file. Default model:
  `anthropic:claude-opus-4-8`.

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
| `MOCK:REC` | Calls `save_recommendation` with fixed args (a Mendoza Malbec, price_band 15_30, source chat, targeted at the first participant), then streams confirmation. |
| `MOCK:JOINTREC` | Calls `save_recommendation` with fixed args for a **joint** recommendation (profile_id null — "for both of you", reasoning mentions both palates), then streams confirmation. |
| `MOCK:SEARCH` | Calls `search_wine_availability` with a fixed query, then streams a text that includes the fixture result's store name. |
| anything else | Streams `MOCK RESPONSE: ` + the user text. No tool calls. |

- After any tool result returns, the mock streams a final text turn (so the chat UI
  always ends with assistant text).

## Model selection UX

- The chat UI shows a model selector listing `getAvailableModels()`.
- The chosen model is stored on the conversation row and used for all its turns.
- New conversations default to `getDefaultModel()`.

## Acceptance criteria

- **AC-LLM-1**: Registry lists only models whose provider API key is configured
  (unit — env permutations).
- **AC-LLM-2**: `getModel` on an unknown id throws the typed error; the chat API maps
  it to a 400 (integration).
- **AC-LLM-3**: With `MOCK_LLM=1`, the registry exposes only the mock and never
  constructs a real provider (unit).
- **AC-LLM-4**: Each mock trigger produces its scripted tool call followed by
  assistant text (integration, via the chat route).
- **AC-LLM-5**: The conversation persists its selected model and the selector shows
  the available list (e2e sees the mock model listed).
