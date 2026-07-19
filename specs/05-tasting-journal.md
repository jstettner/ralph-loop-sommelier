# 05 — Tasting Journal

The persistent record of everything the user has tasted. Primary write path is the
chat tool `record_tasting_note` (specs/04); the journal is the read/manage surface.

## Pages

### `/journal`
- Reverse-chronological list of the **household's** tasting notes (shared visibility).
- Each entry: wine name + producer + vintage, style badge, **author badge** (profile
  name in its accent color), verdict badge (liked / mixed / disliked), rating (1–5
  rendered as filled blocks, e.g. `▮▮▮▮▯`), top nose descriptors, relative date.
- Filters: **by taster** (any household profile / all), by verdict, by style.
  Empty state points the user to start a tasting in chat.
- When multiple profiles have notes for the same wine from the same conversation
  (a shared tasting), the list groups them into one card showing both scores
  side-by-side ("Alex ▮▮▮▮▯ · Sam ▮▮▯▯▯").

### `/journal/[noteId]`
- Full structured note: author, appearance, nose descriptors, palate dimensions
  (sweetness / acidity / tannin / alcohol / body as labeled 1–5 scales), flavors,
  finish, rating, verdict, freeform text, link to the source conversation if present.
- If other household profiles have notes for the same wine, link to them
  ("Sam also tasted this").
- Delete (with confirm). Editing is out of scope for v1 — corrections happen by
  tasting again or via chat.

## API

- `GET /api/journal` (list, filterable by taster/verdict/style), `GET /api/journal/[id]`,
  `DELETE /api/journal/[id]` — all household-scoped; 404 for notes outside the
  household.

## Acceptance criteria

- **AC-JRNL-1**: A note created via chat appears in `/journal` with wine name, author
  badge, verdict, and rating (e2e).
- **AC-JRNL-2**: The detail page renders all structured fields of a note including its
  author (e2e or integration + component render).
- **AC-JRNL-3**: Taster, verdict, and style filters return only matching notes
  (integration).
- **AC-JRNL-4**: Deleting a note removes it from the list; deleting another
  household's note id returns 404 and deletes nothing (integration).
- **AC-JRNL-5**: A shared tasting (two profiles, same wine, same conversation) renders
  as one grouped card showing both tasters' scores (e2e, via MOCK:SHARED).
