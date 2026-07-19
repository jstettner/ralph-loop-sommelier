# 06 — Memory & Palate Profile

The system that makes the tutor remember each taster: an explicit, inspectable palate
profile **per household profile** (specs/11), seeded by an onboarding quiz and
maintained by the agent over time.

## Onboarding quiz

Shown once **per profile**, immediately after that profile is created (`/onboarding` —
signup's first profile and any later-added profile both flow through it). Skippable
("I'll figure it out as I go"). 6 questions, each mapping to profile dimensions:

1. How do you take your coffee? (black / milk / sweet / don't drink) → tannin & sweetness priors
2. Grapefruit or orange juice? → acidity prior
3. Tea: strong-steeped or light? → tannin prior
4. Dark chocolate or milk chocolate? → sweetness/tannin priors
5. What have you enjoyed drinking before? (multi: bold reds / light reds / crisp whites / rich whites / rosé / bubbles / none yet) → seeds style notes
6. How adventurous are you feeling? (stick to crowd-pleasers ↔ show me the weird stuff, 1–5) → adventurousness

Submitting writes `quiz_answers` (raw) and derived dimension priors to the
**active profile's** `palate_profiles` row. The mapping quiz→dimensions is a pure
function in `src/lib/palate.ts` (unit-tested). Skipping creates an empty palate row.

## Profile maintenance

- The agent updates a taster's palate via the `update_palate_profile` tool (specs/04),
  attributed by `taster_profile_id` — merge semantics: only provided dimensions
  overwrite; notes append, never replace.
- Verdict-derived lists are **per profile**: "liked" = that profile's notes with
  verdict liked, "disliked" = verdict disliked. Computed queries, not duplicated state.

## Profile page (`/profile`)

- Renders the **active profile's** palate: the 6 dimensions as labeled 1–5 scales
  (unknown shown as `--`), adventurousness, the agent's notes (timestamped entries),
  and that profile's liked / disliked wine lists. Switching the active profile
  (specs/11) switches whose palate this page shows.
- "Retake quiz" re-runs onboarding for the active profile and re-derives priors
  (notes are preserved). Rename-profile control lives here too (specs/11).

## Acceptance criteria

- **AC-MEM-1**: Completing the quiz persists raw answers and derived dimensions on the
  active profile's palate row; the derivation function maps each answer to the
  documented dimensions (unit + e2e).
- **AC-MEM-2**: Skipping the quiz creates an empty palate row and lands on the
  dashboard (e2e).
- **AC-MEM-3**: `update_palate_profile` merges partial updates without clobbering
  unspecified dimensions and appends notes, for the attributed profile only
  (integration).
- **AC-MEM-4**: `/profile` shows the active profile's dimensions, notes, and
  liked/disliked lists derived from that profile's verdicts (e2e: after a MOCK:TASTING
  liked note, the wine appears in the first participant's liked list).
- **AC-MEM-5**: Two profiles in one household hold independent palate rows — a quiz or
  tool update for one leaves the other unchanged (integration).
