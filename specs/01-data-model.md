# 01 — Data Model

One canonical Drizzle schema in `src/db/schema.ts`. SQLite. All IDs are text (nanoid or
UUID — pick one and use it everywhere). All timestamps are integer epoch-ms with Drizzle
`integer({ mode: 'timestamp_ms' })`.

## Tables

### Better Auth tables
`user`, `session`, `account`, `verification` — exactly as Better Auth's Drizzle adapter
requires. Do not hand-modify their shape beyond what Better Auth documents.

### `palate_profiles` — one row per user
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| user_id | text, unique, FK → user.id | one profile per user |
| quiz_answers | json | raw onboarding quiz answers (specs/06) |
| sweetness, acidity, tannin, body, oak | integer 1–5, nullable | preference dimensions; null = unknown |
| adventurousness | integer 1–5, nullable | willingness to try weird stuff |
| notes | text | freeform agent-maintained palate observations |
| updated_at | timestamp | |

### `wines`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| name | text, required | e.g. "Catena Malbec" |
| producer | text, nullable | |
| vintage | integer, nullable | |
| grapes | json string[] | e.g. ["Malbec"] |
| region | text, nullable | |
| country | text, nullable | |
| style | text enum: red, white, rose, sparkling, dessert, fortified, orange | |
| price_band | text enum: under_15, 15_30, 30_60, over_60 | nullable |
| created_at | timestamp | |

### `tasting_notes`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| user_id | text FK → user.id | |
| wine_id | text FK → wines.id | |
| appearance | text, nullable | |
| nose | json string[] | aroma descriptors |
| palate | json | `{ sweetness, acidity, tannin, alcohol, body: 1–5 nullable each, flavors: string[] }` |
| finish | text, nullable | |
| rating | integer 1–5, nullable | |
| verdict | text enum: liked, mixed, disliked | required |
| freeform | text, nullable | user's own words |
| conversation_id | text FK → conversations.id, nullable | which chat produced it |
| created_at | timestamp | |

### `conversations`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| user_id | text FK → user.id | |
| title | text | default "New tasting session" until set |
| model | text | `provider:model-id` used |
| created_at, updated_at | timestamp | |

### `messages`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| conversation_id | text FK → conversations.id | |
| role | text enum: user, assistant | |
| parts | json | AI SDK UIMessage parts (text + tool calls/results), stored verbatim so history round-trips |
| created_at | timestamp | |

### `recommendations`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| user_id | text FK → user.id | |
| wine_name | text | may be a style description ("Marlborough Sauvignon Blanc") or a specific bottle |
| producer, grape, region | text, nullable | |
| style | text enum (same as wines.style), nullable | |
| price_band | text enum (same as wines.price_band), nullable | |
| reasoning | text | why, tied to the user's palate profile |
| status | text enum: suggested, purchased, tasted, dismissed | default suggested |
| source | text enum: chat, dashboard | |
| created_at | timestamp | |

### `grapes` (curriculum — specs/09)
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| slug | text unique | e.g. "cabernet-sauvignon" |
| name | text | |
| color | text enum: red, white | |
| aka | json string[] | synonyms |
| profile | text | what it tastes like, body/acid/tannin character |
| classic_regions | json string[] | |
| what_to_taste_for | text | tasting guidance for a learner |
| benchmark_styles | json string[] | e.g. ["Napa Cabernet ($20–40)", "Left Bank Bordeaux"] |
| order_index | integer | curriculum ordering |

## Rules

- Every user-owned table (`palate_profiles`, `tasting_notes`, `conversations`,
  `messages` via conversation, `recommendations`) is **always** queried scoped to the
  session user. No query path may return another user's rows.
- Migrations are generated with drizzle-kit and committed. Never edit the DB by hand.

## Acceptance criteria

- **AC-DATA-1**: Migrations apply cleanly to an empty SQLite file (`db:migrate` from scratch).
- **AC-DATA-2**: `db:seed` is idempotent — running it twice yields the same grape count.
- **AC-DATA-3**: Inserting and reading back a tasting note round-trips all JSON fields
  (nose array, palate object) without loss.
- **AC-DATA-4**: A query helper for each user-owned table requires a userId argument;
  integration tests prove user B cannot read user A's tasting notes, conversations,
  recommendations, or profile through any API route.
