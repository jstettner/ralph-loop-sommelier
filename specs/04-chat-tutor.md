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
- New chat button; conversation list (title, participant badges, relative time) in the
  chat sidebar — household-wide (shared visibility).
- Title: first user message truncated to 60 chars (set once).

## Live response and tool activity

- Assistant text renders progressively as stream deltas arrive; the UI must not wait
  for the completed response before showing text. While a request is submitted or
  streaming, the transcript shows an active indicator and prevents a duplicate send.
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
