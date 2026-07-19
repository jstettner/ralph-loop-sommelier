# 00 — Architecture (THE STACK PIN)

This file is the single source of truth for technology choices. **Do not deviate, add
alternatives, or introduce parallel implementations.** If something here seems wrong,
the fix is to change this spec — never to quietly use a different library.

## Product in one sentence

A multi-user web app where people learn wine conversationally with an AI sommelier-tutor
that guides tastings, records structured notes, builds a palate profile, and recommends
purchasable next bottles.

## Stack (pinned)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15+, App Router** | `output: 'standalone'` in next.config from day one (self-hosted, single Node process). No pages/ router. |
| Language | **TypeScript, `strict: true`** | No `any`, no `@ts-ignore` (guard-enforced). |
| Styling | **Tailwind CSS v4** | No CSS-in-JS, no component library. Design system in specs/10-ui.md. |
| Database | **SQLite via better-sqlite3** | Single file DB. Path from `DATABASE_URL` (default `./data/wine.db`). |
| ORM | **Drizzle ORM** | Schema in `src/db/schema.ts`. Migrations via `drizzle-kit`. One canonical schema. |
| Auth | **Better Auth** (email + password) | Drizzle adapter, SQLite. No external auth service. |
| LLM layer | **Vercel AI SDK (`ai` v5+)** | Provider registry; see specs/03-llm-provider.md. |
| Default model | `anthropic:claude-opus-4-8` via `@ai-sdk/anthropic` | Other providers env-gated. |
| Validation | **Zod** | All API inputs and tool schemas. |
| Unit/integration tests | **Vitest** | `tests/unit/`, `tests/integration/`. |
| E2E tests | **Playwright** | `e2e/`. Runs against the built app with the mock LLM (specs/03). |
| Lint | **ESLint** (next config) | `@typescript-eslint/no-explicit-any` = error. |

## Scaffolding rule

Do **not** run interactive `create-next-app` (this directory is non-empty). Hand-author
`package.json`, `tsconfig.json`, `next.config.ts`, Tailwind setup, and the layout below.

## Directory layout (pinned)

```
src/
  app/                  # App Router routes (pages + API route handlers)
  components/           # Shared React components
  db/                   # schema.ts, client.ts, seed.ts, migrations/
  lib/
    llm/                # provider registry, mock provider, system-prompt assembly, tools
    search/             # SearchProvider interface + implementations
    auth.ts             # Better Auth instance
  server/               # server-only helpers (session guards, memory assembly)
tests/
  unit/                 # Vitest — pure logic
  integration/          # Vitest — API routes + real (ephemeral) SQLite
  fixtures/             # search fixtures, mock-LLM scripts, test seed data
e2e/                    # Playwright specs
scripts/                # harness helpers — guard.sh is the operator's, do not modify
specs/                  # these files — source of truth, operator-owned
```

## Required npm scripts (verify.sh depends on these exact names)

| Script | Must do |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `start:e2e` | Start the **built** app on port **3100** with `MOCK_LLM=1` and a dedicated e2e DB file |
| `typecheck` | `tsc --noEmit` |
| `lint` | ESLint over the repo with `--max-warnings 0` |
| `test:unit` | `vitest run tests/unit` |
| `test:integration` | `vitest run tests/integration` |
| `test:e2e` | `playwright test` (its config builds/starts via `start:e2e` webServer) |
| `db:migrate` | Apply Drizzle migrations to `DATABASE_URL` |
| `db:seed` | Seed the curriculum (specs/09) — idempotent |
| `db:reset:test` | Delete + re-migrate + re-seed the test database file(s) |

## Environment contract

| Var | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file path. Default `./data/wine.db`. Tests/e2e MUST use separate files under `./data/` (gitignored). |
| `BETTER_AUTH_SECRET` | Auth secret. Tests use a fixed dummy value. |
| `BETTER_AUTH_URL` | Base URL (default `http://localhost:3000`; e2e uses `:3100`). |
| `ANTHROPIC_API_KEY` | Enables Anthropic models in the registry. |
| `OPENAI_API_KEY` | Enables OpenAI models in the registry. |
| `AVAILABLE_MODELS` | Comma list of `provider:model-id` the operator exposes, e.g. `anthropic:claude-opus-4-8,anthropic:claude-sonnet-4-6`. |
| `DEFAULT_MODEL` | One entry from `AVAILABLE_MODELS`. Default `anthropic:claude-opus-4-8`. |
| `TAVILY_API_KEY` | Enables real web search for availability (specs/08). Absent → graceful degrade. |
| `MOCK_LLM` | `1` → registry serves only the deterministic mock provider (specs/03). Set for all tests/e2e. |

`.env.example` documents every variable with comments and safe placeholder values.

## Anti-drift rules (hard)

1. **Single source of truth.** One schema, one DB client, one auth instance, one provider
   registry. No adapters-for-adapters, no compatibility shims, no duplicate helpers.
2. **No placeholders.** No stubs, no `TODO`/`FIXME` in `src/`, no canned-data functions
   outside the explicitly-specced mock/fixture implementations. Full implementations only.
3. **Search before you build.** Assume it may already exist; confirm via code search first.
4. **Tests are contracts.** Never weaken, skip, or delete a test to get green. If a test
   seems wrong, the spec decides — align the test with the spec.
5. **Don't touch the harness.** `verify.sh`, `scripts/guard.sh`, and `specs/*` are
   operator-owned. Never edit them to make verification pass.

## Acceptance criteria

- **AC-ARCH-1**: `npm run typecheck` passes with `strict: true`, zero errors.
- **AC-ARCH-2**: `npm run lint` passes with zero warnings; `no-explicit-any` is an error rule.
- **AC-ARCH-3**: `npm run build` completes successfully with `output: 'standalone'` configured.
- **AC-ARCH-4**: Every required npm script above exists and does what its row says.
- **AC-ARCH-5**: `.env.example` exists and documents every variable in the environment contract.
