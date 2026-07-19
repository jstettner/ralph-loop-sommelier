# Implementation plan

## Now

- None — visual polish pass complete and green.

## Next

- None.

## Done

- [x] Architecture and data foundation (`specs/00`, `specs/01`, `specs/09`; AC-ARCH-1–5, AC-DATA-1–3, AC-CURR-1)
- [x] Household auth, profile CRUD/selection, and onboarding quiz/skip (`specs/02`, `specs/06`, `specs/11`; AC-AUTH-1–5, AC-PROF-1–5, AC-MEM-1–2)
- [x] LLM registry, deterministic mock, memory prompt, tools, chat persistence, and availability providers (`specs/03`, `specs/04`, `specs/08`; AC-LLM-1–5, AC-CHAT-1–6, AC-MEM-3/5, AC-SRCH-1–4, AC-DATA-6)
- [x] Household journal, structured detail, filters, deletion, and grouped shared tastings (`specs/04`, `specs/05`; AC-CHAT-7–8, AC-JRNL-1–5)
- [x] Recommendation generation/targeting/lifecycle, household isolation audit, and complete palate view (`specs/01`, `specs/06`, `specs/07`; AC-REC-1–6, AC-DATA-4–5, AC-MEM-4)
- [x] Curriculum library/deep links and complete CRT/mobile/pixel-icon interface (`specs/09`, `specs/10`; AC-CURR-2–4, AC-UI-1–11)
- [x] Final acceptance audit: `./verify.sh --done` passes with all 69 criteria covered.

## Discoveries

- 2026-07-18: Repository began as a harness-only project with no application files, tests, or durable implementation plan; completion coverage was 0/69.
- 2026-07-18: Better Auth's current compatible release requires Drizzle ORM 0.45.2+, so the foundation aligns the ORM range with that declared peer dependency.
- 2026-07-18: Foundation increment is green under `./verify.sh`; acceptance coverage is 9/69 before the authentication increment.
- 2026-07-18: Active-profile cookies include the Better Auth session id, are httpOnly, and set `secure` from the configured URL scheme so HTTP e2e works consistently in Chromium and WebKit.
- 2026-07-18: Better Auth rate limiting remains enabled normally and is disabled only under `MOCK_LLM=1`, preventing parallel desktop/mobile journeys from rate-limiting each other.
- 2026-07-18: Auth/profile/onboarding increment is green under `./verify.sh`; acceptance coverage is now 21/69.
- 2026-07-18: AI SDK v5's prescribed `MockLanguageModelV2` imports its `msw` peer at runtime, so `msw` is an explicit test-only dependency even though no HTTP mocking layer is otherwise needed.
- 2026-07-18: LLM/chat/search increment is green across integration plus Chromium/WebKit journeys; acceptance coverage is now 39/69.
- 2026-07-18: Journal/shared-tasting increment is green under both browser projects; acceptance coverage is now 46/69.
- 2026-07-18: Recommendation/isolation/profile increment is green in integration and both browser projects; acceptance coverage is now 55/69.
- 2026-07-18: Curriculum/UI increment is green across unit, build, Chromium, and WebKit; test references now cover all 69 acceptance criteria pending the completion gate.
- 2026-07-18: Completion gate passed: typecheck, lint, guard, standalone build, 15 unit tests, 15 integration tests, 8 dual-project e2e runs, and 69/69 AC coverage.
- 2026-07-18: No font was ever actually bundled — globals.css named "JetBrains Mono" without loading it, so every visitor saw their OS mono fallback. Spec 10 mandates Geist Mono via next/font; now loaded from the `geist` package (local woff2, no build-time network, keeps `verify.sh` builds deterministic offline).
- 2026-07-18: The old `PixelIcon` base stamped a generic 8×8 accent square + highlight pip over every sprite while each icon's own rects rendered in near-invisible `#1A1A1C`, so all eight icons read as identical blobs. Redrawn: base is a bare `<g fill={color}>` wrapper; each sprite supplies outline + inset-accent + ≤1 highlight rects.
- 2026-07-18: Tailwind v4 emits utilities inside `@layer utilities`, so any UNLAYERED rule in globals.css silently beats utility classes (unlayered > layered regardless of specificity). The bare `a { color: var(--cyan) }` rule was overriding every `text-[var(--…)]` utility on links app-wide (all nav links rendered cyan). Element-level defaults in globals.css must live in `@layer base`.
- 2026-07-18: A `next dev` server running in the same checkout corrupts `.next` for `verify.sh`'s build+`next start` e2e phase (webpack-runtime `TypeError: a[d] is not a function`, pages 500). Stop `npm run dev` before running the gate.
- 2026-07-18: Operator authorized a specs/10-ui.md update (own commit, since guard.sh only rejects *uncommitted* operator-file changes): flat 3%-white scanlines replaced by a layered CRT surface (fractal-noise grain, corner vignette, dark 2px scanlines, cyan rolling bar, stepped flicker — adapted from the operator's "Fold Tactical" reference) plus faint dual-layer currentColor phosphor bloom on all text. AC-UI-2's wording still holds verbatim (same `scanlines` testid, `pointer-events: none`, reduced-motion kills the animations), so no test changes were needed.
