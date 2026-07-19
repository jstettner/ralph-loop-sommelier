# 07 — Recommendations

"What should I try next?" — persisted suggestions with lifecycle, surfaced on the
dashboard and generated both in chat and on demand.

## Sources

1. **Chat**: the agent calls `save_recommendation` whenever it recommends a concrete
   next bottle (specs/04).
2. **Dashboard**: a "Suggest my next bottle" button on the dashboard calls
   `POST /api/recommendations/generate`, which runs a single non-chat `generateText`
   call (same registry, same memory assembly as specs/04) with the
   `save_recommendation` tool forced/available, producing 1–3 persisted
   recommendations. Under `MOCK_LLM=1` this yields the mock's fixed recommendation.

## Lifecycle

`suggested → purchased → tasted`, or `→ dismissed` from any state. Status buttons on
each card. "Tasted" links the user toward chat to record the tasting.

## Dashboard (`/dashboard`)

The post-login landing page. Sections:
- **Up next**: recommendations with status `suggested` or `purchased` (card: wine
  name/style/grape/region, price band, reasoning, status controls).
- **Recent tastings**: last 5 journal entries (linking into `/journal`).
- **Palate snapshot**: mini view of profile dimensions, linking to `/profile`.
- Empty states for all three that route the user to the right action.

## API

- `GET /api/recommendations` (list, session-scoped)
- `POST /api/recommendations/generate`
- `PATCH /api/recommendations/[id]` (status transitions only; validate enum)

## Acceptance criteria

- **AC-REC-1**: A `MOCK:REC` chat message persists a recommendation that then appears
  on the dashboard "Up next" section (e2e).
- **AC-REC-2**: "Suggest my next bottle" creates ≥1 persisted recommendation under the
  mock and renders it without reload (e2e).
- **AC-REC-3**: Status transitions persist and dismissed recommendations leave "Up
  next" (integration + e2e).
- **AC-REC-4**: Recommendation reads/writes are session-scoped; foreign ids → 404
  (integration).
