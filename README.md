# Nexora

A TypeScript workspace for company operations: a React application, API gateway, and eleven domain services. This revision adds the browser application to the earlier backend archive.

**Status:** implemented application with passing local checks; full Docker, browser, and database acceptance remain release gates. See `docs/IMPLEMENTATION_STATUS.md` for known gaps. Do not interpret the archive's legacy filename as production certification.

## Run the complete application

Install Node.js 22.13 or newer, pnpm 11.19, and Docker Desktop with Docker Compose. On Windows, use PowerShell in the extracted `nexora` folder.

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm setup:env
pnpm run doctor
docker compose up --build -d --wait --wait-timeout 240
```

Open **http://localhost:5173** and create your workspace. No demo login is required. The first registered account owns its organization. Invite teammates from **Administration → Invitations**. Development email is captured at **http://localhost:8025**, including verification, password-reset, and invitation links.

If a container does not become healthy, inspect it with `docker compose ps` and `docker compose logs --tail=100 SERVICE_NAME`. The first build installs dependencies and generates Prisma clients. Give Docker enough memory for multiple Node builds, or build services sequentially.

The browser calls `/api` on the same origin. Nginx forwards those requests to the gateway; the gateway forwards them to the owning service. Browser refresh tokens are stored in HttpOnly cookies. The access token stays in memory.

## Run with hot reload

```sh
pnpm infra:up
pnpm db:deploy
pnpm build
pnpm dev
```

Open **http://localhost:5173**. The Vite proxy forwards `/api` to port 4000. Shared packages export compiled code, so build them before starting development. Root `.env` is loaded by service configuration; `setup:env` creates it with fresh application secrets and does not overwrite an existing file.

## Verify

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm check:all
```

With the complete stack running:

```sh
pnpm test:e2e
pnpm --filter @nexora/e2e exec playwright install chromium
pnpm test:browser
```

`test:e2e` uses real public gateway endpoints and retrieves the invitation token from Mailpit. It fails if invitation delivery is unavailable. Browser tests exercise registration, cookie-based sessions, attendance, logout, and mobile overflow. The CI workflow has separate static/unit and Docker/browser jobs; it has not been executed remotely in this session.

## Included modules

- Account registration, sign-in, email verification, password reset, invitation acceptance, and sign-out.
- Permission-aware dashboard, navigation, people, departments, teams, branches, attendance, leave requests, balances, and performance reviews.
- Projects, tasks, assignment APIs, comments, activity, leads, clients, contacts, pipelines, deals, invoices, payments, expenses, and reports.
- Document upload/download/sharing, notifications, preferences, memberships, invitations, organization settings, and audit history.
- Loading, empty, validation, API-error, pagination, creation/editing, and confirmation states. Forms retain input after server errors.
- Decimal database money fields, invoice payment transactions, idempotency keys, overpayment rejection, and currency-filtered financial summaries (USD by default).
- Encrypted persistent email delivery queue; event delivery spool, broker confirms, reconnect/retry handling, and notification deduplication.

## Structure

| Location | Purpose |
|---|---|
| `apps/web` | React/Vite frontend |
| `apps/api-gateway` | Public API gateway, port 4000 |
| `services/*` | Eleven services, ports 4001–4011 |
| `packages/*` | Shared auth, HTTP, events, mail, validation, utilities |
| `services/*/prisma/migrations` | Initial and incremental SQL migrations |
| `e2e` | Real HTTP acceptance flow and Playwright browser tests |
| `docs/openapi.json` | Generated public route catalog; request validation is in service schemas |
| `docs/BUILD_PROMPT.md` | Improved master specification |

## Operations

- Stop containers without deleting data: `docker compose down`.
- View mail: http://localhost:8025. Mailpit does not send to external recipients.
- For a real SMTP provider, replace the notification-service SMTP settings and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optional `SMTP_USER`/`SMTP_PASSWORD`, and `SMTP_FROM`. Set `FRONTEND_URL` and `CORS_ORIGIN` to the browser origin. Production browser cookies require HTTPS except browsers' localhost exception.
- Keep PostgreSQL, document storage, and the event spool on persistent volumes. Do not rotate `INTERNAL_SERVICE_SECRET` with queued encrypted emails without planning key migration.
- Inspect failed email rows with Prisma Studio and the notification database. Messages retry up to eight times; successful messages have their encrypted payload cleared.
- Notification poison messages move to `notification-service.events.dead` after bounded retries. Investigate before replaying.
- Back up databases and document storage together. `docker compose down --volumes` deletes development data; it is not part of the normal stop command.

The optional `pnpm seed` command is for development fixtures only. Read `seed/src/seed.ts` before running it; normal use starts by registering your own account.
