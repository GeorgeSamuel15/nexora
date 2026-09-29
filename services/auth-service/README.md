# auth-service

Owns identity and credentials only: registration, login, refresh-token
rotation, logout, password reset, and email verification. Does not own
organization membership, roles-as-data, or employee profiles - those are
organization-service and user-service (Phase 4).

## Endpoints

| Method | Path                    | Auth                | Notes                                                                             |
| ------ | ----------------------- | ------------------- | --------------------------------------------------------------------------------- |
| POST   | `/auth/register`        | none                | Creates a user + bootstraps an organization (see "Phase 4 dependency" below)      |
| POST   | `/auth/login`           | none                | Rate-limited, lockout after 5 failed attempts in a row                            |
| POST   | `/auth/refresh`         | none                | Rotates the refresh token; detects reuse of a stale token and revokes the session |
| POST   | `/auth/logout`          | none                | Idempotent - revokes the session tied to the given refresh token                  |
| POST   | `/auth/forgot-password` | none                | Always returns the same response, whether or not the email exists                 |
| POST   | `/auth/reset-password`  | none                | Consumes the reset token once, revokes all existing sessions                      |
| POST   | `/auth/verify-email`    | none                | Consumes the verification token once                                              |
| GET    | `/auth/me`              | Bearer access token | Returns the authenticated user + current org/role                                 |
| GET    | `/health`               | none                | Reports Postgres + Redis reachability                                             |

## Phase 4 dependency (read this before running register/login)

Registration and login call out to organization-service:

- `POST /internal/organizations/bootstrap` - called on register, creates the
  Organization + OWNER membership. On failure, the just-created auth user
  is deleted (compensating action) so retrying doesn't hit
  `EMAIL_ALREADY_REGISTERED`.
- `POST /internal/memberships/lookup` - called on login and on every
  refresh, so a role change made in organization-service takes effect
  without requiring re-login.

Neither endpoint exists yet - organization-service is Phase 4. Until then,
`register` and `login` will fail with `ORGANIZATION_SERVICE_UNAVAILABLE`
against a real server. This is intentional: the contract is defined here
first (`src/clients/organizationServiceClient.ts`) so organization-service
can be built against the exact shape auth-service already expects.

## What's tested

`tests/auth.service.test.ts` - business logic against an in-memory fake
Prisma client (`tests/fakePrisma.ts`) and a fake organization-service
client: register, duplicate email, saga rollback on bootstrap failure,
login, wrong-password lockout after 5 attempts, refresh rotation, stolen
refresh-token reuse detection, role-change propagation on refresh, logout
idempotency, password reset (single-use, revokes sessions), and the
"don't reveal whether an email exists" behavior.

`tests/auth.routes.test.ts` - the same flows over real HTTP via supertest
against `createApp()` with the same fakes, plus validation and auth
middleware checks (`401` with no token, `400` on a malformed register body).

**Not yet run in this environment.** The sandbox that wrote this code has
no network access, so `pnpm install` was never executed here - meaning
these tests have not actually been executed, only written and reviewed.
What _was_ checked without installing anything:

- Every file's syntax, via the TypeScript compiler's transpile-only mode.
- The service's own logic (types, control flow, our own function
  signatures) type-checked cleanly against the real `@nexora/*` packages,
  using loose stand-ins for the external npm packages (`express`, `zod`,
  `jsonwebtoken`, `bcrypt`, `ioredis`, `@prisma/client`, `supertest`,
  `vitest`) that aren't installed here. Those stand-ins verify our code's
  structure, not the real libraries' exact type surfaces.

Run for real before trusting this:

```bash
pnpm install
pnpm --filter @nexora/auth-service typecheck
pnpm --filter @nexora/auth-service test
```

## Database

`prisma/schema.prisma` targets `AUTH_SERVICE_DATABASE_URL` (defaults to
`nexora_auth`, created automatically by the Phase 2 Postgres init script).
No migration has been generated or run yet:

```bash
cp .env.example .env   # or use the repo-root .env
pnpm --filter @nexora/auth-service prisma:migrate -- --name init
```

## Security notes

- Passwords: bcrypt, cost factor 12 (`@nexora/auth`).
- Access tokens are short-lived JWTs; refresh tokens rotate on every use
  and are stored server-side only as a SHA-256 hash, never in plaintext.
- Presenting an already-rotated (stale) refresh token revokes the entire
  session rather than just rejecting the one request - treated as a
  possible token theft signal.
- Login is rate-limited per IP via Redis (10/min) in addition to the
  5-attempt account lockout, which is tracked independently in Postgres.
- `/auth/me` and every future protected route derive identity from the
  verified JWT only (`req.auth`, set in `middleware/authenticate.ts`) -
  never from client-supplied `organizationId`/`role`/`userId` fields.
