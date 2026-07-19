# 07 — Recommendations

"What should I try next?" — persisted suggestions with lifecycle, per-taster **and
joint** ("bottles you'll both like"), surfaced on the dashboard and generated both in
chat and on demand.

## Targeting

A recommendation targets either one profile (`profile_id` set) or the whole household
(`profile_id` null — a **joint** recommendation). Joint reasoning must explicitly
reference the overlap between the household's palates ("you both run low-tannin,
high-acid — try a cru Beaujolais").

## Sources

1. **Chat**: the agent calls `save_recommendation` (specs/04) — targeted at a
   participant, or joint when recommending for everyone present.
2. **Dashboard**: two generate buttons calling `POST /api/recommendations/generate`:
   - `mode: "profile"` — "Suggest my next bottle": single non-chat `streamText`
     run (same registry + memory assembly as specs/04, active profile's context)
     with `save_recommendation` available; persists 1–3 recommendations for the
     active profile while streaming reasoning and tool activity to the client.
   - `mode: "joint"` — "Suggest a bottle for all of us" (shown only when the household
     has ≥2 profiles): same call with **every** profile's palate in context,
     instructed to find the intersection; persists 1–3 joint recommendations.
   Under `MOCK_LLM=1` these yield the mock's fixed recommendation(s).

Both dashboard actions use the full-screen `NEURAL TRACE` overlay from specs/10 for
provider-visible reasoning summaries. Safe `save_recommendation` activity appears in
the same overlay when a model emits no reasoning, so the user sees genuine progress
rather than an opaque `THINKING...` state. The response remains a non-chat operation:
it does not create a conversation or permanent transcript. The overlay dissolves once
generation completes, then the new recommendation cards render without a page reload.

## Lifecycle

`suggested → purchased → tasted`, or `→ dismissed` from any state. Status buttons on
each card. "Tasted" links toward chat to record the tasting.

## Dashboard (`/dashboard`)

The post-login landing page. Sections:
- **Up next (for {active profile})**: `suggested`/`purchased` recommendations targeted
  at the active profile (card: wine name/style/grape/region, price band, reasoning,
  status controls).
- **For the table** (only when household has ≥2 profiles): joint recommendations,
  same card + controls, badged with all profiles' colors.
- **Recent tastings**: last 5 household journal entries with author badges (linking
  into `/journal`).
- **Palate snapshot**: mini view of the active profile's dimensions, linking to
  `/profile`.
- Empty states for all sections that route the user to the right action.

## API

- `GET /api/recommendations` (list, household-scoped; filterable by target: active
  profile / joint / all)
- `POST /api/recommendations/generate` (`mode: "profile" | "joint"`)
- `PATCH /api/recommendations/[id]` (status transitions only; validate enum)

## Acceptance criteria

- **AC-REC-1**: A `MOCK:REC` chat message persists a recommendation targeted at the
  first participant that appears in the dashboard "Up next" section (e2e).
- **AC-REC-2**: "Suggest my next bottle" creates ≥1 persisted recommendation for the
  active profile under the mock and renders it without reload (e2e).
- **AC-REC-3**: Status transitions persist and dismissed recommendations leave the
  dashboard sections (integration + e2e).
- **AC-REC-4**: Recommendation reads/writes are household-scoped; foreign ids → 404
  (integration).
- **AC-REC-5**: A `MOCK:JOINTREC` chat message (or a `mode: "joint"` generate) persists
  a `profile_id`-null recommendation that appears in "For the table" and not in
  "Up next" (e2e).
- **AC-REC-6**: The joint generate button and "For the table" section are absent for
  single-profile households (e2e or integration).
- **AC-REC-7**: Both dashboard generate modes progressively display their streamed
  neural trace and safe recommendation-tool state, dissolve the overlay on completion,
  and render the newly persisted cards without reload; errors close the active trace
  and remain actionable in the underlying dashboard (desktop + mobile e2e).
