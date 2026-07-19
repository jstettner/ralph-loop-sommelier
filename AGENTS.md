# wine-trainer — agent operational guide

AI sommelier-tutor web app. **`specs/` is the source of truth** — read `specs/00-architecture.md`
first; it pins the stack and layout. Build exactly what the specs say.

## Verify (the only definition of done)

```
./verify.sh          # incremental gate — run before every commit
./verify.sh --done   # completion gate — the goal is: this passes
```

Individual gates while iterating: `npm run typecheck | lint | test:unit | test:integration | test:e2e`,
`bash scripts/guard.sh`, `npm run db:reset:test`.

## Run

```
npm run dev            # app on :3000 (needs .env — copy .env.example)
npm run db:migrate && npm run db:seed
MOCK_LLM=1 npm run dev # deterministic mock LLM, no API keys needed
```

## Stack (pinned — do not deviate, see specs/00-architecture.md)

Next.js 15 App Router (`output: 'standalone'`) · TS strict · Tailwind v4 ·
SQLite + better-sqlite3 + Drizzle · Better Auth · Vercel AI SDK v5 (provider registry,
default `anthropic:claude-opus-4-8`) · Vitest · Playwright.

## Hard rules

1. **Never edit** `specs/`, `verify.sh`, `scripts/guard.sh`, or `GOAL.md`. If a spec
   seems wrong or two specs conflict, stop and ask the operator.
2. **No placeholders, no stubs, no skipped tests, no suppressions.** The guard fails
   the build on all of them. Full implementations only.
3. **Tests are contracts.** Never weaken a test to get green — align tests with specs.
4. **One source of truth** — one schema, one DB client, one auth instance, one model
   registry. Search the codebase before writing anything new.
5. Tag tests with the acceptance-criterion id they prove (e.g. `AC-AUTH-1` in the test
   name) — `verify.sh --done` requires every AC in specs/ to be referenced by a test,
   and the test must genuinely assert the behavior, not just mention the id.
6. Work one focused task at a time; commit whenever `./verify.sh` is green with a
   message describing the increment.

## Progress tracking (IMPLEMENTATION_PLAN.md — yours to maintain)

Maintain `IMPLEMENTATION_PLAN.md` at the repo root as your durable working state —
it must survive context compaction, so keep it current on disk, not in your head:

- **Now / Next / Done**: a prioritized checklist of remaining work (reference spec +
  AC ids), the item in progress, and completed items (pruned once committed).
- **Discoveries**: short dated bullets for anything future iterations need — decisions
  made, deferrals and why, integration gotchas, failing-test diagnoses in progress.
- Update it as part of every increment (it rides along in the same commit).
- On a fresh or compacted context: read `IMPLEMENTATION_PLAN.md` + `git log --oneline`
  first, and run `bash scripts/guard.sh --done` to see AC coverage (N/69) before
  picking the next task.

## Operational notes (maintained by the agent — keep brief)

(none yet)
