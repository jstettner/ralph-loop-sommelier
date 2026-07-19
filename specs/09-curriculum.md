# 09 — Seeded Curriculum

A small, seeded knowledge base of core grapes that grounds the tutor's teaching and
powers a browsable library page. Content lives in `src/db/seed.ts` (typed constants)
and is inserted by `db:seed` (idempotent — upsert by slug).

## The 18 grapes (order_index = curriculum order)

Whites: Sauvignon Blanc, Pinot Grigio, Riesling, Chardonnay (unoaked → oaked),
Chenin Blanc, Gewürztraminer, Albariño, Viognier.

Reds: Pinot Noir, Gamay (Beaujolais), Merlot, Cabernet Sauvignon, Malbec, Syrah/Shiraz,
Grenache/Garnacha, Sangiovese, Tempranillo, Zinfandel.

Ordering principle: start with high-contrast, widely available grapes (Sauvignon Blanc
vs Chardonnay; Pinot Noir vs Cabernet), then broaden.

## Content requirements per grape

Every row fully populated (schema in specs/01): `profile` (2–4 sentences, plain
language, body/acid/tannin character), `classic_regions` (2–4), `what_to_taste_for`
(2–3 sentences a beginner can act on with one bottle), `benchmark_styles` (2–3 concrete,
widely-available styles with price bands, e.g. "Marlborough NZ Sauvignon Blanc, $12–18").
No placeholder text — this content ships to users.

## Library page (`/grapes`)

- Grid/list of all grapes in curriculum order, color-coded red/white.
- `/grapes/[slug]`: full profile, regions, what to taste for, benchmark styles, plus a
  "Taste this grape with me" link that opens a new chat pre-filled with a starter
  message naming the grape.

## Tutor integration

The memory assembly (specs/04) includes a one-line-per-grape curriculum summary so the
tutor can sequence learning ("You've logged three bold reds — ready to try the
opposite pole? Grab any Marlborough Sauvignon Blanc…").

## Acceptance criteria

- **AC-CURR-1**: `db:seed` inserts exactly the 18 grapes above, fully populated —
  a test asserts no empty/placeholder fields (integration).
- **AC-CURR-2**: `/grapes` lists all 18 in curriculum order (e2e).
- **AC-CURR-3**: A grape detail page renders profile, regions, tasting guidance, and
  benchmark styles (e2e).
- **AC-CURR-4**: "Taste this grape with me" starts a chat whose first user message
  names the grape (e2e).
