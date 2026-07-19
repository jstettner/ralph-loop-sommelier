# 02 — Auth

Better Auth, email + password, Drizzle adapter on the app's SQLite database. Sessions
via Better Auth's cookie mechanism. No OAuth providers, no magic links, no email
verification flow in v1 (auto-verify on signup).

## Contract

- Better Auth instance in `src/lib/auth.ts`; route handler mounted at
  `/api/auth/[...all]` per Better Auth's Next.js App Router integration.
- Pages: `/signup`, `/login`. Redirect authenticated users away from both.
- Every app page except `/`, `/login`, `/signup` requires a session; unauthenticated
  access redirects to `/login`.
- Every API route except the auth handler requires a session; unauthenticated requests
  get 401 JSON, not a redirect.
- Logout affordance in the app shell.
- Signup flow: create account → onboarding palate quiz (specs/06) → dashboard.
  Login flow: → dashboard.
- Minimum password length 8; signup shows validation errors inline.

## Acceptance criteria

- **AC-AUTH-1**: A new user can sign up with email + password and lands in the
  onboarding quiz (e2e).
- **AC-AUTH-2**: An existing user can log in and reach the dashboard; wrong password
  shows an error and does not create a session (e2e).
- **AC-AUTH-3**: Unauthenticated requests to protected API routes return 401
  (integration).
- **AC-AUTH-4**: Unauthenticated visits to protected pages redirect to `/login` (e2e).
- **AC-AUTH-5**: Logout ends the session; a subsequent protected-page visit redirects
  to `/login` (e2e).
