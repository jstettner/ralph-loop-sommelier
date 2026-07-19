# 01 — Data Model

One canonical Drizzle schema in `src/db/schema.ts`. SQLite. All IDs are text (nanoid or
UUID — pick one and use it everywhere). All timestamps are integer epoch-ms with Drizzle
`integer({ mode: 'timestamp_ms' })`.

## Tenancy model (read this first)

- The **Better Auth `user`** is the **household** — the login credential a couple (or
  individual) shares. In app code, refer to it as the household.
- A household contains 1–4 **profiles** (Netflix-style: "who's tasting?"). Profiles own
  palates, tasting notes, and ratings. Two profiles tasting the same bottle in the same
  conversation is the app's signature flow.
- **Scoping rule**: every household-resident table carries `household_id`
  (= Better Auth user id) and is ALWAYS queried scoped to the session's household.
  Attributed tables additionally carry `profile_id`, which must reference a profile of
  that same household (validate on every write).
- **Visibility**: within a household, all profiles see all data (shared visibility);
  writes are attributed to their author profile. Across households, nothing leaks —
  ever.

## Tables

### Better Auth tables
`user` (the household), `session`, `account`, `verification` — exactly as Better Auth's
Drizzle adapter requires.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| household_id | text FK → user.id | |
| name | text, required | display name, unique within household |
| color | text enum: cyan, magenta, amber, green | profile accent (specs/10); auto-assigned first free |
| created_at | timestamp | |

Max 4 profiles per household (enforced in the API).

### `palate_profiles` — one row per profile
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| profile_id | text, unique, FK → profiles.id | |
| quiz_answers | json | raw onboarding quiz answers (specs/06) |
| sweetness, acidity, tannin, body, oak | integer 1–5, nullable | preference dimensions; null = unknown |
| adventurousness | integer 1–5, nullable | |
| notes | text | freeform agent-maintained palate observations |
| updated_at | timestamp | |

### `wines` (global, deduped across households)
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| name | text, required | |
| producer | text, nullable | |
| vintage | integer, nullable | |
| grapes | json string[] | |
| region, country | text, nullable | |
| style | text enum: red, white, rose, sparkling, dessert, fortified, orange | |
| price_band | text enum: under_15, 15_30, 30_60, over_60 | nullable |
| created_at | timestamp | |

### `tasting_notes` — attributed to a profile
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| household_id | text FK → user.id | |
| profile_id | text FK → profiles.id | the taster |
| wine_id | text FK → wines.id | |
| appearance | text, nullable | |
| nose | json string[] | |
| palate | json | `{ sweetness, acidity, tannin, alcohol, body: 1–5 nullable each, flavors: string[] }` |
| finish | text, nullable | |
| rating | integer 1–5, nullable | |
| verdict | text enum: liked, mixed, disliked | required |
| freeform | text, nullable | the taster's own words |
| conversation_id | text FK → conversations.id, nullable | |
| created_at | timestamp | |

A shared tasting produces **one row per participating profile** for the same wine_id +
conversation_id.

### `conversations`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| household_id | text FK → user.id | |
| participant_ids | json string[] | profile ids present in this session; ≥1, all from this household |
| title | text | default "New tasting session" |
| model | text | `provider:model-id` used |
| created_at, updated_at | timestamp | |

Index conversations by `(household_id, updated_at, id)` so the household history can
be read in a stable newest-first order without loading every conversation. `updated_at`
means the latest persisted user or assistant message (or creation time before the
first message); renaming a conversation does not move it to the top of history.

### `messages`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| conversation_id | text FK → conversations.id | |
| role | text enum: user, assistant | user turns are the shared device; speaker attribution is conversational, not structural |
| parts | json | AI SDK UIMessage parts stored verbatim |
| created_at | timestamp | |

Deleting a conversation cascades to its messages. `tasting_notes.conversation_id`
uses `ON DELETE SET NULL`: deleting a transcript must not delete a tasting note or its
wine, and the journal simply stops offering a source-conversation link for that note.

### `chat_runs` — durable ownership of an assistant turn
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| household_id | text FK → user.id | denormalized for mandatory tenancy scoping |
| conversation_id | text FK → conversations.id | cascade on conversation delete |
| user_message_id | text FK → messages.id, unique | idempotency key for one submitted turn |
| assistant_message_id | text FK → messages.id, unique | partial/final assistant message checkpoint |
| status | text enum: running, completed, failed, interrupted | completed/failed/interrupted are terminal |
| safe_error | text, nullable | user-facing failure summary only; no stack/provider payload |
| started_at, heartbeat_at, updated_at | timestamp | |
| finished_at | timestamp, nullable | set for every terminal state |

A partial unique index permits at most one `running` row per conversation. Starting a
turn is one transaction: validate the household-scoped conversation, reject a different
active turn, insert the user message exactly once, insert the initially empty assistant
message, and insert its `chat_runs` row. Retrying the same `user_message_id` returns the
existing run rather than creating messages or invoking the model again. A different
message submitted while that run is active is rejected.

The server updates the assistant message's `parts` as safe stream checkpoints and moves
the run once from `running` to a terminal status. Row checks require running rows to
have no `finished_at`/`safe_error`, completed rows to have `finished_at` and no error,
and failed/interrupted rows to have both `finished_at` and a non-empty safe error. Run
rows are household-resident data; deleting a conversation cascades through its messages
and runs.

### `recommendations`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| household_id | text FK → user.id | |
| profile_id | text FK → profiles.id, **nullable** | null = joint recommendation for the household ("for both of you") |
| wine_name | text | style description or specific bottle |
| producer, grape, region | text, nullable | |
| style | text enum (wines.style), nullable | |
| price_band | text enum (wines.price_band), nullable | |
| reasoning | text | tied to the target palate(s); joint recs must reference the overlap |
| status | text enum: suggested, purchased, tasted, dismissed | default suggested |
| source | text enum: chat, dashboard | |
| created_at | timestamp | |

### `grapes` (curriculum — specs/09; global, unchanged)
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| slug | text unique | |
| name | text | |
| color | text enum: red, white | |
| aka | json string[] | |
| profile | text | |
| classic_regions | json string[] | |
| what_to_taste_for | text | |
| benchmark_styles | json string[] | |
| order_index | integer | |

## Rules

- Every read of a household-resident table filters by the session household. Every
  write validates that any `profile_id` (including each entry of `participant_ids`)
  belongs to the session household.
- Migrations are generated with drizzle-kit and committed. Never edit the DB by hand.

## Acceptance criteria

- **AC-DATA-1**: Migrations apply cleanly to an empty SQLite file (`db:migrate` from scratch).
- **AC-DATA-2**: `db:seed` is idempotent — running it twice yields the same grape count.
- **AC-DATA-3**: Inserting and reading back a tasting note round-trips all JSON fields
  (nose array, palate object) without loss.
- **AC-DATA-4**: Household isolation — integration tests prove household B cannot read
  or write household A's profiles, tasting notes, conversations, or recommendations
  through any API route.
- **AC-DATA-5**: Attribution integrity — writes referencing a `profile_id` (or
  `participant_ids` entry) from a different household are rejected (integration).
- **AC-DATA-6**: Two tasting notes from different profiles against the same wine and
  conversation coexist and are independently retrievable (integration).
- **AC-DATA-7**: Deleting a conversation deletes its messages but preserves linked
  tasting notes with `conversation_id` set to null, while deleting or changing no wine,
  palate-profile, or recommendation data (integration).
- **AC-DATA-8**: Chat-run migrations enforce one active run per conversation, unique
  user/assistant message references, valid running/terminal row shapes, household
  isolation, idempotent reuse of a submitted user-message id, and cascade on
  conversation delete (integration).
