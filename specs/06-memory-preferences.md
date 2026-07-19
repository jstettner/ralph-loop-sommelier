# 06 — Memory & Palate Profile

The system that makes the tutor remember you: an explicit, inspectable palate profile
seeded by an onboarding quiz and maintained by the agent over time.

## Onboarding quiz

Shown once, immediately after signup (`/onboarding`). Skippable ("I'll figure it out
as I go"). 6 questions, each mapping to profile dimensions:

1. How do you take your coffee? (black / milk / sweet / don't drink) → tannin & sweetness priors
2. Grapefruit or orange juice? → acidity prior
3. Tea: strong-steeped or light? → tannin prior
4. Dark chocolate or milk chocolate? → sweetness/tannin priors
5. What have you enjoyed drinking before? (multi: bold reds / light reds / crisp whites / rich whites / rosé / bubbles / none yet) → seeds style notes
6. How adventurous are you feeling? (stick to crowd-pleasers ↔ show me the weird stuff, 1–5) → adventurousness

Submitting writes `quiz_answers` (raw) and derived dimension priors to
`palate_profiles`. The mapping quiz→dimensions is a pure function in
`src/lib/palate.ts` (unit-tested). Skipping creates an empty profile row.

## Profile maintenance

- The agent updates the profile via the `update_palate_profile` tool (specs/04) —
  merge semantics: only provided dimensions overwrite; notes append, never replace.
- Verdict-derived lists: "liked" = notes with verdict liked, "disliked" = verdict
  disliked. These are computed queries, not duplicated state.

## Profile page (`/profile`)

- Renders the 6 dimensions as labeled 1–5 scales (unknown shown as `--`),
  adventurousness, the agent's notes (timestamped entries), and the liked / disliked
  wine lists.
- "Retake quiz" re-runs onboarding and re-derives priors (notes are preserved).

## Acceptance criteria

- **AC-MEM-1**: Completing the quiz persists raw answers and derived dimensions; the
  derivation function maps each answer to the documented dimensions (unit + e2e).
- **AC-MEM-2**: Skipping the quiz creates an empty profile and lands on the dashboard
  (e2e).
- **AC-MEM-3**: `update_palate_profile` merges partial updates without clobbering
  unspecified dimensions and appends notes (integration).
- **AC-MEM-4**: `/profile` shows dimensions, notes, and liked/disliked lists derived
  from journal verdicts (e2e: after a MOCK:TASTING liked note, the wine appears in the
  liked list).
