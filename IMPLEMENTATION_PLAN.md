# Implementation plan

## Now

- [ ] Recommendations and dashboard lifecycle (`specs/07`; AC-REC-1–6, AC-DATA-4–5)

## Next

- [ ] Complete palate profile view coverage (`specs/06`; AC-MEM-4)
- [ ] Curriculum pages and complete CRT/mobile interface (`specs/09`, `specs/10`)
- [ ] Full acceptance audit and `./verify.sh --done`

## Done

- [x] Architecture and data foundation (`specs/00`, `specs/01`, `specs/09`; AC-ARCH-1–5, AC-DATA-1–3, AC-CURR-1)
- [x] Household auth, profile CRUD/selection, and onboarding quiz/skip (`specs/02`, `specs/06`, `specs/11`; AC-AUTH-1–5, AC-PROF-1–5, AC-MEM-1–2)
- [x] LLM registry, deterministic mock, memory prompt, tools, chat persistence, and availability providers (`specs/03`, `specs/04`, `specs/08`; AC-LLM-1–5, AC-CHAT-1–6, AC-MEM-3/5, AC-SRCH-1–4, AC-DATA-6)
- [x] Household journal, structured detail, filters, deletion, and grouped shared tastings (`specs/04`, `specs/05`; AC-CHAT-7–8, AC-JRNL-1–5)

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
