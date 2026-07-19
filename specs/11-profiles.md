# 11 — Profiles ("Who's tasting?")

Netflix-style profiles inside a household login. One shared credential, up to 4 named
tasters, each with their own palate and journal attribution. Shared visibility within
the household.

## Profile picker (`/profiles`)

- Full-screen terminal panel titled `WHO'S TASTING?` listing the household's profiles
  as selectable tiles (name + accent color, specs/10), plus `+ NEW TASTER` (disabled at
  4 profiles).
- Shown: after login when the household has >1 profile; always reachable from the
  shell's profile switcher. With exactly 1 profile, login auto-selects it and goes to
  the dashboard.
- Selecting a profile sets it as the **active profile** (httpOnly cookie or session
  storage server-side — must survive reloads, scoped to the auth session).
- Signup flow: create account → create first profile (name) → that profile's palate
  quiz (specs/06) → dashboard.

## Profile management

- Create: name (1–24 chars, unique within household) → auto-assigned free accent color
  → straight into that profile's quiz.
- Rename from `/profile`. Delete (with confirm) removes the profile and its palate
  profile — but deletion is **blocked** while the profile has tasting notes (journal
  history is household history; rename instead), and the last remaining profile can
  never be deleted.
- All profile CRUD is household-scoped API (`/api/profiles`).

## Active-profile semantics

- The active profile is the default author for chat sessions, quiz answers, and
  profile-page views.
- Every server handler resolves `(household, activeProfile)`; requests with a stale or
  foreign active-profile cookie are rejected/reset to the picker.
- The shell (specs/10) always shows the active profile name in its accent color;
  clicking it returns to the picker.

## Acceptance criteria

- **AC-PROF-1**: Signup creates the first profile and routes through its quiz;
  a household's second profile can be created from the picker and gets a distinct
  accent color (e2e).
- **AC-PROF-2**: Login with >1 profile lands on the picker; selecting one lands on the
  dashboard with that profile active in the shell; with exactly 1 profile the picker is
  skipped (e2e).
- **AC-PROF-3**: The active profile persists across reloads and switches correctly via
  the shell switcher (e2e).
- **AC-PROF-4**: A 5th profile is rejected; duplicate names within a household are
  rejected; the last profile cannot be deleted; a profile with tasting notes cannot be
  deleted (integration).
- **AC-PROF-5**: Profile CRUD from another household's session returns 404
  (integration).
