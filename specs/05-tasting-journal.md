# 05 — Tasting Journal

The persistent record of everything the user has tasted. Primary write path is the
chat tool `record_tasting_note` (specs/04); the journal is the read/manage surface.

## Pages

### `/journal`
- Reverse-chronological list of the user's tasting notes.
- Each entry: wine name + producer + vintage, style badge, verdict badge
  (liked / mixed / disliked), rating (1–5 rendered as filled blocks, e.g. `▮▮▮▮▯`),
  top nose descriptors, relative date.
- Filters: by verdict, by style. Empty state points the user to start a tasting in chat.

### `/journal/[noteId]`
- Full structured note: appearance, nose descriptors, palate dimensions (sweetness /
  acidity / tannin / alcohol / body as labeled 1–5 scales), flavors, finish, rating,
  verdict, freeform text, link to the source conversation if present.
- Delete (with confirm). Editing is out of scope for v1 — corrections happen by
  tasting again or via chat.

## API

- `GET /api/journal` (list, filterable), `GET /api/journal/[id]`,
  `DELETE /api/journal/[id]` — all session-scoped; 404 for notes the user doesn't own.

## Acceptance criteria

- **AC-JRNL-1**: A note created via chat appears in `/journal` with wine name, verdict,
  and rating (e2e).
- **AC-JRNL-2**: The detail page renders all structured fields of a note (e2e or
  integration + component render).
- **AC-JRNL-3**: Verdict and style filters return only matching notes (integration).
- **AC-JRNL-4**: Deleting a note removes it from the list; deleting another user's note
  id returns 404 and deletes nothing (integration).
