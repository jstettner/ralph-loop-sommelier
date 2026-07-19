# 04 — Chat Tutor (the sommelier agent)

The core surface: a streaming chat at `/chat` (and `/chat/[conversationId]`) backed by
`POST /api/chat` using AI SDK `streamText` + `useChat`, with tools, persisted history,
and a memory-aware system prompt.

## The persona & teaching method (system prompt requirements)

The system prompt lives in `src/lib/llm/system-prompt.ts` as an assembled template.
It must instruct the model to be:

- A warm, unpretentious sommelier-tutor. Plain language first, jargon introduced
  *with* definitions, never as gatekeeping.
- **Socratic on tastings**: when the user is tasting a bottle, walk them through a
  structural sequence — look → smell → taste → finish — asking one focused question at
  a time ("Is the acid making your mouth water? Compare it to biting a green apple"),
  offering concrete anchors for each dimension (sweetness, acidity, tannin, alcohol,
  body).
- **Single-bottle pedagogy**: assume the user has ONE bottle and no side-by-side
  comparison. Teach by contrast to *memory anchors* (lemon juice, black tea, butter)
  and to wines from their journal.
- **Curriculum-grounded**: the prompt includes the seeded grape curriculum summary
  (specs/09) so the tutor steers learners along a sensible grape progression.
- **Tool-forward**: explicitly instructed to call `record_tasting_note` once a tasting
  discussion has yielded enough structure; to call `update_palate_profile` when it
  learns a durable preference; to call `save_recommendation` when it recommends a
  specific next bottle; to call `search_wine_availability` when the user asks what to
  buy nearby. State *when* to call each tool, not just what it does.

## Memory assembly (reads are context, writes are tools)

Every `/api/chat` request assembles the system prompt server-side from:
1. The persona + teaching method (static).
2. The user's palate profile (dimensions + notes + quiz summary).
3. The user's last 10 tasting notes (wine, verdict, rating, standout descriptors).
4. Liked / disliked wine lists (from verdicts).
5. Curriculum grape summary (name + one-line profile each).

Assembly lives in `src/server/memory.ts` and is a pure function of (profile, notes,
grapes) → string, so it's unit-testable.

## Tools (AI SDK tools, Zod schemas, defined in `src/lib/llm/tools.ts`)

| Tool | Args (Zod) | Effect |
|---|---|---|
| `record_tasting_note` | wine fields (name, producer?, vintage?, grapes, region?, style, price_band?) + note fields (appearance?, nose[], palate{...}, finish?, rating?, verdict, freeform?) | Upserts the wine (match on name+producer+vintage), inserts the tasting note scoped to the user + conversation. Returns ids. |
| `update_palate_profile` | partial dimensions (1–5) + notes append | Merges into the user's profile row; appends to notes with a timestamp. |
| `save_recommendation` | wine_name, producer?, grape?, region?, style?, price_band?, reasoning | Inserts a recommendation (status suggested, source chat). |
| `search_wine_availability` | query, location? | Runs the SearchProvider (specs/08) and returns normalized results for the model to interpret. |

All tool executions are server-side, scoped to the authenticated user, validated with
Zod, and their results returned to the model.

## Conversation persistence

- Conversations + messages persist per specs/01. Reloading `/chat/[id]` restores full
  history including tool call/result parts.
- New chat button; conversation list (title + relative time) in the chat page sidebar.
- Title: first user message truncated to 60 chars (set once).

## Acceptance criteria

- **AC-CHAT-1**: Authenticated user sends a message and receives a streamed assistant
  reply that renders progressively (e2e with mock).
- **AC-CHAT-2**: A `MOCK:TASTING` message results in a visible confirmation in chat AND
  a persisted tasting note owned by that user (e2e).
- **AC-CHAT-3**: Reloading a conversation URL restores prior messages, including turns
  containing tool activity (e2e).
- **AC-CHAT-4**: The system prompt assembly includes profile dimensions, recent note
  descriptors, and liked/disliked lists when they exist, and omits those sections
  gracefully when empty (unit).
- **AC-CHAT-5**: Tool executions reject writes for a conversation the session user does
  not own (integration → 403/404).
- **AC-CHAT-6**: `record_tasting_note` upserts wines — two notes for the same
  name+producer+vintage reference one wine row (integration).
