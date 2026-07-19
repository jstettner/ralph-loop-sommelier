# The Goal (paste into /goal)

Build the wine-trainer web app to completion, exactly as specified in `specs/`
(read `specs/00-architecture.md` first — the stack is pinned; `CLAUDE.md` has the
operating rules).

**Definition of done: `./verify.sh --done` exits 0.** That means: typecheck, lint,
guard, build, unit, integration, and Playwright e2e all green, and every acceptance
criterion (AC-*) in `specs/` is referenced by a test that genuinely proves it.

The end state, as a user journey: a new user signs up, takes the palate quiz, chats
with the CRT-terminal sommelier (mock LLM in tests, real models via the registry in
prod), gets guided through tasting a single bottle, has a structured note recorded to
their journal, sees their palate profile evolve, receives a persisted recommendation
on the dashboard, and can browse the 18-grape curriculum — with all data strictly
scoped per user.

Work in small increments: pick the most important gap vs the specs, implement it fully
(no placeholders), run `./verify.sh`, commit when green, repeat. Never modify `specs/`,
`verify.sh`, `scripts/guard.sh`, or this file — if a spec is wrong or ambiguous, stop
and ask.
