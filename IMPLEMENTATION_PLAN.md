# Implementation plan

## Now

- [ ] Household authentication and profile lifecycle (`specs/02`, `specs/11`; AC-AUTH-1–5, AC-PROF-1–3)

## Next

- [ ] Per-profile onboarding and palate memory (`specs/06`)
- [ ] LLM registry, deterministic mock, memory prompt, and tools (`specs/03`, `specs/04`)
- [ ] Journal and shared tasting flow (`specs/05`)
- [ ] Recommendations and availability search (`specs/07`, `specs/08`)
- [ ] Curriculum pages and complete CRT/mobile interface (`specs/09`, `specs/10`)
- [ ] Full acceptance audit and `./verify.sh --done`

## Done

- [x] Architecture and data foundation (`specs/00`, `specs/01`, `specs/09`; AC-ARCH-1–5, AC-DATA-1–3, AC-CURR-1)

## Discoveries

- 2026-07-18: Repository began as a harness-only project with no application files, tests, or durable implementation plan; completion coverage was 0/69.
- 2026-07-18: Better Auth's current compatible release requires Drizzle ORM 0.45.2+, so the foundation aligns the ORM range with that declared peer dependency.
- 2026-07-18: Foundation increment is green under `./verify.sh`; acceptance coverage is 9/69 before the authentication increment.
