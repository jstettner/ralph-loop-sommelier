# 04 — Chat Tutor (the sommelier agent)

The core surface: a streaming chat at `/chat` (and `/chat/[conversationId]`) backed by
`POST /api/chat` using AI SDK `streamText` + `useChat`, with tools, persisted history,
and a memory-aware system prompt. **The signature flow is the shared tasting**: two
people in the same room, one device, one bottle — the agent hosts both.

## Participants

- Starting a chat lets the user pick participants from the household's profiles
  (default: the active profile; a prominent `+ taste together` control adds others).
  Persisted as `participant_ids` (specs/01); fixed for the conversation's lifetime.
- All tool writes attribute to a participant (below); the server rejects attribution
  to non-participants.

## The persona & teaching method (system prompt requirements)

The system prompt lives in `src/lib/llm/system-prompt.ts` as an assembled template.
It must instruct the model to be:

- A warm, unpretentious sommelier-tutor. Plain language first, jargon introduced
  *with* definitions, never as gatekeeping.
- **Socratic on tastings**: walk through look → smell → taste → finish, one focused
  question at a time, with concrete anchors for each structural dimension (sweetness,
  acidity, tannin, alcohol, body — "is the acid making your mouth water, like biting a
  green apple?").
- **Single-bottle pedagogy**: assume ONE bottle, no side-by-side. Teach by contrast to
  memory anchors (lemon juice, black tea, butter) and to wines from the journal.
- **A shared-tasting host** when the conversation has ≥2 participants: address tasters
  **by name**, interview each in turn ("Alex — what do you smell? … Sam, same
  question"), celebrate disagreement as palate data ("you two split on this — that's
  the tannin difference in your profiles"), and record a **separate note per taster**.
  Since both tasters type through one shared input, the agent attributes statements
  conversationally ("was that Alex or Sam?") when unclear — never guesses.
- **Curriculum-grounded**: includes the seeded grape summary (specs/09) to steer a
  sensible progression.
- **Tool-forward**: explicitly state *when* to call each tool: `record_tasting_note`
  per taster once their tasting has enough structure; `update_palate_profile` when a
  durable preference for a specific taster emerges; `save_recommendation` when
  recommending a concrete next bottle (joint when it's for everyone present);
  live web search when current or externally verifiable information matters, and
  availability search when asked what to buy nearby. Native model search takes
  precedence over the provider-neutral fallback per specs/08.

## Memory assembly (reads are context, writes are tools)

Every `/api/chat` request assembles the system prompt server-side from:
1. The persona + teaching method (static).
2. **Each participant's** palate profile (name, dimensions, notes, quiz summary).
3. Each participant's last 10 tasting notes (wine, verdict, rating, standout descriptors).
4. Each participant's liked / disliked wine lists (from verdicts).
5. Curriculum grape summary (name + one-line profile each).

Assembly lives in `src/server/memory.ts` as a pure function of
(participants[], their profiles, their notes, grapes) → string, unit-testable.

## Tools (AI SDK tools, Zod schemas, defined in `src/lib/llm/tools.ts`)

| Tool | Args (Zod) | Effect |
|---|---|---|
| `record_tasting_note` | `taster_profile_id` + wine fields (name, producer?, vintage?, grapes, region?, style, price_band?) + note fields (appearance?, nose[], palate{...}, finish?, rating?, verdict, freeform?) | Upserts the wine (match name+producer+vintage), inserts a tasting note attributed to that taster + this conversation. Rejects non-participant ids. |
| `update_palate_profile` | `taster_profile_id` + partial dimensions (1–5) + notes append | Merges into that taster's palate row; notes append with timestamp. Rejects non-participants. |
| `save_recommendation` | `for_profile_id` (nullable — null = joint, for the whole household) + wine_name, producer?, grape?, region?, style?, price_band?, reasoning | Inserts a recommendation (status suggested, source chat). |
| `search_web` | query | Provider-neutral fallback for current externally verifiable information when the selected model has no usable native search; runs the SearchProvider (specs/08). |
| `search_wine_availability` | query, location? | Provider-neutral fallback specialized for nearby buying; runs the same SearchProvider and requires location rather than guessing (specs/08). |

The system prompt lists each participant's name **with** their `profile_id` so the
model can attribute correctly. All executions are server-side, household-scoped,
Zod-validated.

## Conversation persistence

- Conversations + messages persist per specs/01. Reloading `/chat/[id]` restores full
  history including tool call/result parts, and shows the participant names.
- Automatic title: first user message truncated to 60 chars (set once); a later explicit
  rename replaces it without subsequent messages overwriting the chosen title.

## Chat history

History is a household-wide way to find and resume persisted conversations; it is not
separate per active profile. It includes empty conversations as well as completed and
in-progress transcripts, because participant/model choices are persisted when a chat
is created. No folders, pins, unread state, or transcript export are in v1.

### History surface

- Every `/chat` route has a **NEW CHAT** action. On desktop (`md`+), a secondary chat
  sidebar also shows history while the starter or selected transcript remains in the
  main pane. On mobile, where that sidebar would crowd the transcript, a labeled
  **HISTORY** control opens the full-width `/chat/history` route; that route has the
  same list and a **NEW CHAT** action. Browser Back returns to the prior chat normally.
- Each row is one conversation and shows its title, participant names in their profile
  colors, a short last-message preview, and semantic last-activity time. The selected
  conversation is visibly marked and uses `aria-current="page"`. Empty conversations
  show `No messages yet` rather than fabricating a preview. The selected chat header
  shows the same title so a successful rename is visible in both places.
- Preview text is the first non-empty plain-text part of the newest persisted message
  that contains text, whitespace-collapsed and truncated for display. If messages exist
  but none contains safe text, the row shows `Activity recorded`. Tool inputs/results,
  reasoning, sources, ids, provider metadata, and error payloads are never used as
  preview text.
- Rows are ordered by `(updated_at DESC, id DESC)`. A persisted user message advances
  `updated_at` immediately; the assistant completion advances it again. Renaming does
  not affect activity order. Relative-time labels may refresh client-side, but the
  underlying timestamp is exposed accessibly and renders correctly without JavaScript.
- The empty state says that prior chats will appear here and offers **NEW CHAT**. The
  history list scrolls independently; it never displaces the sticky mobile composer or
  causes horizontal page overflow.

### Finding and loading conversations

- A labeled search input filters case-insensitively by conversation title only. It is
  debounced, reflected in the `q` URL query parameter, and submitting an empty/blank
  query restores the unfiltered list. Search is deliberately title-only: persisted
  tool data and potentially sensitive transcript text are not indexed for v1.
- History is fetched in pages of 25. **LOAD MORE** uses an opaque cursor derived from
  the last row's `(updated_at, id)` pair, appends without duplicates, and returns no row
  created or updated after that cursor. Changing `q` discards the old rows and cursor.
- Selecting a row navigates to `/chat/[conversationId]` and restores the canonical full
  transcript per AC-CHAT-3; it never creates a new conversation or replays tool calls.
- `GET /api/conversations?q=<text>&cursor=<opaque>&limit=25` returns only household-
  scoped summary data needed by the list plus `nextCursor` (null at the end). `limit`
  is optional, defaults to 25, and is capped at 50. A malformed cursor or invalid limit
  returns 400 rather than silently changing the query.

### Rename and delete

- Each history row exposes an accessible overflow/actions control. **RENAME** accepts a
  trimmed title of 1–60 characters. `PATCH /api/conversations/[id]` validates
  `{ title }`, updates only the title, and does not change `updated_at`.
- **DELETE CHAT** requires an explicit confirmation naming the conversation. On confirm,
  `DELETE /api/conversations/[id]` permanently deletes the conversation and messages.
  Tasting notes and other learned data survive exactly as specified by AC-DATA-7. If
  the open conversation is deleted, success navigates to `/chat`; otherwise the row is
  removed in place. The API returns 409 instead of deleting any conversation with an
  active chat run. A failed mutation retains the row/title and shows an actionable
  inline error.
- Rename/delete controls are unavailable for the active conversation while a response
  is submitted or streaming, preventing deletion underneath an in-flight tool/model
  run. All list, rename, delete, and detail operations require a session and scope by
  `household_id`; a conversation belonging to another household returns 404.

## Live response and tool activity

- Assistant text renders progressively as stream deltas arrive; the UI must not wait
  for the completed response before showing text. While a request is submitted or
  streaming, the transcript shows an active indicator and prevents a duplicate send.
- The multiline composer sends its current message on `Meta+Enter` (`⌘+Enter` on
  macOS) and `Control+Enter` (Windows/Linux equivalent) when Shift and Alt are not also
  held. The shortcut calls the exact same validated submit path as the **SEND** button:
  it trims outer whitespace, preserves internal line breaks, clears only after
  submission starts, and does nothing for an empty message or while the conversation
  has an active run. Plain `Enter` (with or without Shift/Alt) inserts a newline and
  never sends.
- Shortcut handling ignores key-repeat events and any Enter keydown while an IME is
  composing, so a held chord or text-composition confirmation cannot submit twice.
  The textarea exposes `aria-keyshortcuts="Meta+Enter Control+Enter"` and has visible
  helper text (`⌘/Ctrl+Enter to send · Enter for new line`); the labeled **SEND** button
  remains available for touch, pointer, switch, and screen-reader users.
- Provider-visible reasoning-summary parts drive the ephemeral full-screen `NEURAL
  TRACE` overlay defined in specs/10. The overlay may open more than once during one
  response when reasoning is interleaved with tools, and it dissolves as final answer
  text takes over. Reasoning content is not rendered into the permanent transcript or
  restored visibly after reload, though complete protocol parts remain persisted where
  required for model/tool continuity.
- A tool activity row appears as soon as its streamed tool-call part arrives and is
  updated **in place**, keyed by tool-call id, through running → completed or failed.
  Multiple tool calls in one response render as distinct rows in call order.
- Tool names use concise user-facing labels and safe summaries: recording a tasting
  note identifies the wine and taster; updating a palate identifies the taster; saving
  a recommendation identifies its target; availability search identifies the query.
  Completed rows confirm the outcome and failed rows show an actionable error without
  exposing stack traces.
- The chat never renders raw tool JSON, internal profile/household ids, provider
  metadata, secrets, or the full availability-provider payload. Friendly summaries
  are derived from validated tool parts, while the complete parts remain persisted for
  model continuity and debugging.
- Reloading a completed conversation restores each tool row in its terminal completed
  or failed state; it must not replay the running animation.

## Navigation-safe continuation

Once a user submits a valid turn, accidental navigation, reload, tab closure, or loss
of the response connection must not cancel its model generation or tool work. This is
continuity within the running single-node app, not a durable external job queue: a
server/process restart cannot resume the provider stream and follows the interrupted-
run behavior below.

### Server-owned run lifecycle

- `POST /api/chat` creates the user message, empty assistant message, and `chat_runs`
  row atomically per specs/01 before model generation begins. The server owns and drains
  the provider stream independently of the HTTP response; client disconnect/abort is
  not forwarded as cancellation of that run. The connected client still receives the
  normal live `UIMessage` stream, but response consumption is never the sole mechanism
  that persists completion or tool results.
- There is at most one active run per conversation. Reposting the same client-generated
  user-message id rejoins/returns that run idempotently. Submitting a different message
  while it is running returns 409 with safe active-run status, and every composer for
  that conversation remains disabled until the run becomes terminal.
- The server checkpoints the in-progress assistant `parts` no more often than once per
  250ms, plus immediately at tool running/completed/failed transitions and at final
  completion. Checkpoints preserve complete protocol parts needed for model continuity,
  while the transcript and history preview continue applying their existing safe-
  rendering rules. A tool call and its side effect execute once even if every client
  disconnects and later rejoins.
- `heartbeat_at` advances at least every 15 seconds while the provider/tool loop is
  alive, including periods with no deltas. A `running` row with no heartbeat for 60
  seconds is atomically marked `interrupted` on the next conversation read or send.
  This prevents a server restart from leaving the chat permanently busy.
- Completion stores the final assistant parts and marks the run `completed` in one
  transaction. Provider/tool failure stores the latest safe parts, a sanitized error,
  and `failed`; stale recovery uses `interrupted`. Terminal failure appears as an
  actionable non-assistant status row, never fabricated sommelier prose, and re-enables
  the composer so the user can send again. Raw errors and provider payloads remain
  server-only.

### Rejoining an active turn

- `GET /api/conversations/[id]` includes the household-scoped current/recent run status
  and its checkpointed assistant message. When `/chat/[id]` opens on a running turn, it
  renders the partial assistant/tool state immediately, shows `CONTINUING RESPONSE…`,
  disables duplicate send, and refreshes checkpoints so new output becomes visible
  within one second. Refreshing stops as soon as the run is terminal and merges by
  message/tool-call id rather than duplicating rows.
- Returning while the run is active may restore the `NEURAL TRACE` only from persisted
  provider-visible reasoning summaries and safe tool summaries belonging to that run.
  Returning after completion follows AC-CHAT-10: the trace stays absent and only the
  permanent transcript/tool terminal states render.
- The history row for an active run displays a safe `GENERATING` status. The persisted
  user message advances conversation activity immediately; completion advances it once
  more. Navigating away or rejoining never creates another conversation, user message,
  assistant message, model call, or tool execution.

## Acceptance criteria

- **AC-CHAT-1**: A user sends a message and receives a streamed assistant reply that
  renders progressively (e2e with mock).
- **AC-CHAT-2**: A `MOCK:TASTING` message yields a visible confirmation AND a persisted
  tasting note attributed to the conversation's first participant (e2e).
- **AC-CHAT-3**: Reloading a conversation URL restores prior messages, including tool
  activity, and shows participant names (e2e).
- **AC-CHAT-4**: System-prompt assembly includes every participant's name, profile id,
  dimensions, and liked/disliked lists when present, and omits empty sections
  gracefully (unit).
- **AC-CHAT-5**: Tool writes attributing to a profile that is not a conversation
  participant are rejected; tool writes into another household's conversation are
  rejected (integration).
- **AC-CHAT-6**: `record_tasting_note` upserts wines — two notes for the same
  name+producer+vintage reference one wine row (integration).
- **AC-CHAT-7**: A conversation started with two participants and a `MOCK:SHARED`
  message produces two tasting notes — same wine, same conversation, different
  profiles, different ratings — both visible in the journal (e2e).
- **AC-CHAT-8**: The participant picker defaults to the active profile and can add a
  second household profile before starting the chat (e2e).
- **AC-CHAT-9**: A deterministic delayed stream proves partial assistant text is visible
  before completion and a streamed tool row appears while running, updates in place to
  its terminal state, uses its friendly safe summary, and restores that terminal state
  after reload without exposing raw JSON or internal ids (e2e).
- **AC-CHAT-10**: A deterministic interleaved stream proves the full-viewport neural
  trace appears on the first reasoning delta, updates progressively around a tool call,
  dissolves when final answer text begins, and stays absent after reload; a no-reasoning
  turn fabricates no trace text (desktop + mobile e2e).
- **AC-CHAT-11**: History returns only the signed-in household's conversations in stable
  newest-activity-first pages; title search, cursor continuation, invalid cursors, and
  the 50-row cap behave as specified without duplicates (integration).
- **AC-CHAT-12**: Desktop history and the mobile `/chat/history` surface show safe title,
  participant, preview, and activity summaries; selecting one resumes the exact stored
  transcript without creating a conversation or replaying a tool (desktop + mobile e2e).
- **AC-CHAT-13**: Empty history and empty-conversation states are explicit, and a chat's
  persisted user message moves it to the top before its delayed assistant response
  completes (integration + e2e).
- **AC-CHAT-14**: Renaming validates the 1–60-character trimmed title, does not change
  activity order, updates history and the open chat, and cannot mutate another
  household's conversation (integration + e2e).
- **AC-CHAT-15**: Confirmed deletion removes a conversation and transcript, preserves
  its linked tasting data per AC-DATA-7, redirects when the deleted chat was open, and
  cannot delete another household's conversation (integration + e2e).
- **AC-CHAT-16**: History search/actions are keyboard- and screen-reader-usable, the
  selected row exposes `aria-current`, and the mobile history list neither obscures the
  composer nor introduces horizontal overflow at 375×667 (component + mobile e2e).
- **AC-CHAT-17**: During a delayed `MOCK:LIVE` turn, navigating to another app route
  before completion does not abort generation; returning shows the completed assistant
  answer and any tool effect exactly once, with no duplicate messages or model
  invocation (desktop + mobile e2e).
- **AC-CHAT-18**: Reopening while a `MOCK:LONGTRACE` turn is still running immediately
  restores its checkpoint, shows continuing/generating state, advances visibly within
  one second, disables duplicate send, and converges to one terminal assistant message
  keyed to the same run; another household cannot inspect or rejoin it (integration +
  e2e).
- **AC-CHAT-19**: A deterministic provider failure and a stale-heartbeat fixture produce
  safe `failed` and `interrupted` terminal states, re-enable sending, expose no raw error,
  reject deletion while truly active, and never leave a conversation permanently busy
  (integration + e2e).
- **AC-CHAT-20**: `Meta+Enter` and `Control+Enter` each submit one non-empty multiline
  message through the normal send path, while plain Enter adds a newline, key repeat
  and IME composition do not submit, and the shortcut cannot bypass empty/busy guards;
  helper text, `aria-keyshortcuts`, and the SEND button remain available (component +
  desktop e2e).
