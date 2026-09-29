# Nexora — executable engineering brief, revision 2

Build and verify Nexora, a multi-tenant company operations platform, using the requirements below. Act as a senior full-stack engineer. Make code changes and execute commands; do not stop at architecture advice. Preserve useful existing code. This is a product implementation, not a landing page or disconnected set of CRUD screens.

## 1. First actions and execution contract

1. Read repository instructions, inspect the working tree, package manifests, lockfile, services, schemas, migrations, tests, frontend and Docker configuration. Identify what exists before creating or replacing files. Never discard unrelated changes.
2. Inspect the available Node/package-manager versions, network access, Docker, databases and broker. Attempt the actual commands before declaring an environment limitation. Do not expose secrets while inspecting configuration.
3. Create `docs/IMPLEMENTATION_STATUS.md` with a requirements matrix. Track each requirement as **missing**, **implemented / unverified**, **verified**, **failing**, or **blocked**. A filename, route, mock test, README assertion or successful compiler run is not proof that a business flow works.
4. Produce a concise plan for the first unfinished phase and begin it. Continue through subsequent feasible phases without repeatedly asking permission. At each boundary, run the relevant checks. A failed prerequisite blocks dependent work, but independent fixes may continue. Never relabel a blocked check as passed.
5. Keep `docs/VERIFICATION.md` current with the exact commands, execution date, exit status, relevant results and limitations. Preserve a reproducible checkpoint if execution is interrupted.
6. Do not promise an error-free or production-ready application merely because code was generated. Completion means the acceptance gates below actually passed.

Do not publish, deploy to a paid account, send real emails or invitations, overwrite existing production data, reset a database, or commit credentials without the user's authorization. Use a local mail catcher and isolated test data for development. Ordinary local coding, reversible fixes and testing should proceed autonomously.

## 2. Fixed scope and stack

Frontend: React, strict TypeScript, Vite, React Router, TanStack Query, Axios, Tailwind CSS, React Hook Form, Zod, Lucide React and Recharts where charts add value.

Backend: Node.js, Express, strict TypeScript, Prisma, PostgreSQL, Zod, JWT, Argon2 or bcrypt, OpenAPI.

Infrastructure: pnpm, Turborepo, Docker Compose, PostgreSQL, RabbitMQ and Redis. Testing: Vitest, Supertest, React Testing Library and Playwright for browser journeys. Use compatible, supported versions; record and lock the versions actually installed. Preserve compatible existing major versions unless a documented issue warrants migration. Consult official documentation when an API or compatibility detail is uncertain.

V1 excludes payroll processing, real payment gateways, tax filing, banking, mobile-native apps and arbitrary workflow builders. Payment records represent internal accounting entries only. Do not silently remove any in-scope module to make delivery easier.

Use this monorepo layout, adapting existing names only when needed:

```text
apps/web, apps/api-gateway
services/{auth,organization,user,hr,project,crm,finance,document,notification,analytics,audit}-service
packages/{types,validation,config,logger,database,events,auth,http,utils,ui}
infrastructure/, scripts/, e2e/, docs/
```

Each service must be independently startable. Share contracts and infrastructure utilities, not business controllers or another service's Prisma client. Avoid generic controllers that hide domain rules, giant files, speculative abstractions and unnecessary distributed components.

## 3. Service and data ownership

| Service | Owns |
|---|---|
| Auth | Credentials, verification/reset tokens, sessions, token issuance, refresh rotation and revocation |
| Organization | Organizations, settings, branches, departments, teams, memberships, invitations, role assignments |
| User | Employee profiles, employee numbers, job titles, status, reporting relationships and employment information |
| HR | Attendance, leave policies/types/balances/requests/approvals and performance reviews |
| Project | Projects, project members, tasks, assignments, comments, activity and progress |
| CRM | Leads, clients, contacts, pipelines, stages, deals and deal activities |
| Finance | Invoices/items, expenses, payment records and financial reporting |
| Document | File metadata, access rules and storage abstraction |
| Notification | In-app notifications, preferences, email delivery records and event consumption |
| Analytics | Permission-scoped aggregates from owning services or explicit event projections |
| Audit | Append-only records of relevant business and security actions |

Use a separate database and least-privilege database account per stateful service; one PostgreSQL server is acceptable for local development. Stateless analytics need not have a database. Services must not query or mutate another service's tables. Validate cross-service references through authenticated internal APIs or explicit projections. Do not assume an arbitrary UUID belongs to the current tenant.

Give every Prisma client an explicit, service-local generation output and generate it **before** typechecking or compiling its imports. Check in migrations for every schema change. Ensure a clean checkout can run `prisma migrate deploy`; `db push` is not a release migration strategy. Seed only an explicitly selected development/test environment.

Keep shared-package runtime exports aligned with built JavaScript. Prove compiled services can import their dependencies with Node, not only with a TypeScript development runner. Lock dependencies and use frozen installs in CI/Docker. Root scripts must fail if any constituent command fails.

## 4. Security invariants

Enforce all authorization inside services, even when the gateway also verifies identity. Derive user, organization, session and effective permissions from trusted server-side authentication; never from user-supplied identity headers, body fields or query parameters. Strip spoofable identity/internal headers at the public gateway. Internal routes require service authentication and must not be reachable through public path rewrites.

Every tenant-owned read, mutation, search, aggregate, relation, download, export, notification and audit query must be tenant scoped. Test tenant isolation using two organizations and real persistence. Reject foreign-tenant references without exposing whether the resource exists. Composite keys/constraints should reinforce tenant relationships where practical.

Implement roles `OWNER`, `ADMIN`, `HR_MANAGER`, `FINANCE_MANAGER`, `SALES_MANAGER`, `PROJECT_MANAGER`, `EMPLOYEE` through a shared permission catalogue. Include the employee, attendance, leave, project, task, CRM, finance, invoice, payment, document, audit and organization permissions from the original scope. Add explicit permissions for new operations. Managers retain appropriate self-service actions. Distinguish **own**, **assigned/project-member**, and **organization-wide** access; `task.update` must not let an employee change every task, and `attendance.read` must not expose every employee's attendance. Managers cannot approve their own leave. Protect the last owner and prevent privilege escalation by administrators or invitees.

Use short-lived access JWTs with algorithm, issuer, audience, expiry and claims validation. Store browser access tokens in memory. Store rotating refresh credentials in HttpOnly cookies with an appropriate path, SameSite policy and Secure in production; never localStorage. Hash refresh/reset/invitation tokens at rest. Use single-flight browser refresh and one retry to prevent rotation races. Protect cookie-authenticated writes against CSRF with trusted Origin checks and/or CSRF tokens. Revoke sessions on logout, account deactivation and password reset; role changes and membership removal must invalidate stale authorization promptly. Test replay of a rotated refresh token.

Implement registration, login, logout, refresh, forgot/reset password, email verification, session listing/revocation, invitation acceptance and protected routing. Nonexistent-account responses must not leak account existence. Use cryptographic random, expiring, single-use tokens and constant-time comparison where applicable. Apply Redis-backed rate limits to sensitive flows, trusted-proxy configuration appropriate to deployment, explicit CORS origins, security headers, request size limits and safe errors. Redact tokens, passwords and secrets from logs, including reset/invitation links.

## 5. Reliability and asynchronous work

Owner registration must create an organization and owner membership without manual database edits. Use an idempotent onboarding saga with durable state and retry/compensation. Handle response loss after a successful remote commit; deleting the local user on every remote error is insufficient. Invitations must be tenant-bound and consumed atomically with membership creation.

Use RabbitMQ for `EMPLOYEE_INVITED`, `LEAVE_REQUESTED`, `LEAVE_APPROVED`, `LEAVE_REJECTED`, `TASK_ASSIGNED`, `TASK_COMPLETED`, `DEAL_WON`, `INVOICE_CREATED`, `PAYMENT_RECEIVED`, and `DOCUMENT_SHARED`, plus other warranted events. Contracts include `eventId`, schema version, type, organization, actor, occurrence time, correlation/request ID and a validated payload.

Use a transactional outbox for database changes that must publish events. Publish with broker confirmation; consumers acknowledge only after commit and deduplicate by event ID using a database constraint/inbox. Use durable exchanges/queues, bounded retries with backoff, dead-letter handling and a documented recovery/replay procedure. Do not claim exactly-once delivery. Test duplicate delivery, a broker outage, retry after restart and failure between processing and acknowledgement. Never publish raw invitation/reset secrets to broadly consumed audit/event queues.

Audit records contain organization, actor, action, entity type/ID, timestamp, request ID and safe metadata/IP where appropriate. Do not swallow security/accounting audit failures and still claim durable auditing. Restrict audit reading by permission and keep writes append-only in the application's public API.

Redis must serve a real purpose, such as distributed rate limiting or short-lived authorization caching, with documented expiry and failure policy. Do not use a cache as the only source of durable business state.

## 6. Domain requirements

**Organization and employees:** Company settings, timezone, currency and working calendar; branches, departments, teams and memberships; invite/accept/revoke; employee create/view/edit/deactivate/search/filter/page. Profiles include user reference, tenant, unique employee number, names, email, phone, title, department/team/manager, type/status, hire date, location and optional avatar. Validate same-tenant references and prevent manager cycles. Deactivation must revoke access without erasing historical records.

**Attendance:** Employees clock in/out for themselves; HR has separately authorized views/corrections. Persist UTC instants and calculate business dates in the organization's timezone, including overnight shifts and daylight-saving changes. A database constraint/transaction must prevent simultaneous active clock-ins. Reject clock-out without an open attendance record. Persist correction reasons and audit changes.

**Leave:** Configurable types, allowance periods, accrual/assignment policy, balances, requests and manager decisions. States: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`. Calculate duration using the organization's working calendar and document weekend/holiday/partial-day rules. Validate date order, overlaps, sufficient balance and entitlement period. Approval, balance decrement and audit/event outbox must be atomic and concurrency safe. Prevent repeated deductions and self-approval; cancellation restores balances exactly once. Include performance reviews with review period, reviewer, employee, ratings/comments and controlled submission/acknowledgement.

**Projects/tasks:** Project fields: name, description, owner, status, priority, dates and tenant. Project states: `PLANNING`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`. Tasks: title, description, project, assignee, creator, priority, status and due date. Task states: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `COMPLETED`, `CANCELLED`. Implement membership, assignments, comments, activity, search/filter/sort/page. Enforce assignment eligibility and own/member access. Derive progress from persisted eligible tasks; document how cancelled tasks and zero-task projects are treated.

**CRM:** Leads include name, company, email/phone, source, owner, notes and `NEW`, `CONTACTED`, `QUALIFIED`, `UNQUALIFIED`, `CONVERTED` status. Convert a lead into client/contact records atomically and idempotently. Support clients, multiple contacts, pipelines, ordered stages, deals and activities. Deals include client, value/currency, owner, pipeline/stage, close date, probability and notes. Validate stage/pipeline/tenant consistency. Won/lost transitions must create the correct activity/event once. Display an interactive pipeline whose changes persist and recover visibly from failed requests.

**Finance:** Invoices have a unique tenant-scoped number, client, dates, currency, notes and items with quantity, unit price, tax and amount. Use Decimal arithmetic or defined integer minor units; never floating-point money. Compute totals on the server and document rounding/currency precision. States: `DRAFT`, `SENT`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `CANCELLED`. Draft editing, sending, cancellation, invoice detail/print/download and payment history must work. Reject payments against cancelled invoices and unsupported overpayments. Use a transaction, appropriate row locking/isolation and an idempotency key to prevent duplicate/concurrent overpayments. Derive status and outstanding amount from payments and due date. Preserve accounting history; corrections use explicit reversal records rather than silent deletion. Expenses include category, amount/currency, date, submitter, notes and approval status. Scope revenue/expenses/balances by currency instead of adding incompatible currencies.

**Documents:** Implement actual upload, list/search, metadata editing, download, share and delete. Metadata includes tenant, display/original name, MIME type, size, storage key, uploader, category, entity link and timestamps. Validate size and content type using file signatures where practical; reject unsafe paths/filenames and unsupported content. Generate storage keys server-side; store files outside public web roots, enforce object access and serve downloads with safe headers. Abstract storage behind an interface with a working local adapter and an S3-compatible extension seam. Handle cleanup when metadata persistence or storage deletion fails. Project/employee document access must follow the parent resource's permissions.

**Notifications:** Database-backed notification center, unread count, mark-read/all-read, user preferences and email delivery records. Map only supported events to intended recipients and valid frontend deep links. Use a local SMTP catcher in development and a configurable production provider; document retry and delivery status. A reset or invitation feature is incomplete if no user can retrieve its email through the supported flow. Never hardcode recipients or mark an email sent before provider acceptance.

**Analytics:** Actual persisted employee, attendance, leave, project/task, sales, invoice, payment and expense metrics; permission-aware dashboard with relevant charts and date ranges. Define metric meanings and currency handling. Display source failures/staleness explicitly; do not represent a failed service as a zero result. Include a generated-at timestamp and refresh behavior.

## 7. Gateway, API and frontend contracts

The gateway owns routing, request IDs, coarse authentication/rate limiting, logs and dependency-aware health, not business operations. Preserve request bodies for JSON and multipart proxying, propagate correlation IDs and use bounded upstream timeouts. Test **actual HTTP forwarding**, methods, cookies, query strings, uploads and path traversal/internal-route rejection; testing only a route table is insufficient.

Preserve an existing coherent public route scheme. Otherwise use documented `/api` namespaces for auth, organization, employees, HR, projects/tasks, CRM, finance, documents, notifications, analytics and audit. Define OpenAPI schemas for implemented routes, authentication, pagination, request/response shapes, errors and upload/download behavior. Provide `/api/openapi.json` and usable documentation. Avoid documentation that lists operations the server does not implement.

Use Zod boundary validation for body, query, path and environment inputs. Allowlist sort fields/directions; cap pagination and upload sizes. Return consistent envelopes:

```json
{"success":true,"data":{"data":[],"pagination":{"page":1,"pageSize":20,"total":0,"totalPages":0}}}
```

```json
{"success":false,"error":{"code":"LEAVE_BALANCE_INSUFFICIENT","message":"There is not enough leave balance."},"requestId":"..."}
```

Use suitable status codes, safe field validation details and production errors without stack traces. Logs include request ID, service, route, method, duration, response status and permitted actor/tenant context. Health/readiness reflect required dependency availability; liveness must not fail merely because an upstream is temporarily unavailable. Support graceful shutdown and drain in-flight requests/consumers.

Build frontend slices with their services, not after every backend phase. Public pages: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/accept-invitation`. Authenticated pages:

```text
/app/dashboard, /app/profile, /app/organization, /app/employees
/app/departments, /app/teams, /app/attendance, /app/leave
/app/projects, /app/projects/:id, /app/tasks
/app/crm/leads, /app/crm/clients, /app/crm/deals
/app/finance/invoices, /app/finance/invoices/:id
/app/finance/expenses, /app/finance/payments
/app/documents, /app/notifications, /app/settings
/app/admin/users, /app/admin/audit-logs
```

Provide permission-aware navigation and actionable forbidden/not-found states. Use one typed API client, server-derived permissions, validated forms, query invalidation and mutation feedback. Clear private query caches on logout/tenant change. Preserve intended navigation after login; notification links must load and select the actual target. Handle request cancellation, loading, empty, error and success states. Do not retry non-idempotent writes automatically without an idempotency key.

Use a polished, accessible, responsive SaaS layout: sidebar, top bar, meaningful page hierarchy, tables with server pagination/search/filter/sort, drawers/forms, confirmation dialogs, keyboard operation, visible focus and correctly associated labels. Use distinctive layouts for dashboard, profiles, project work, pipeline and invoices. Never render decorative buttons with no action, sample values as live data, silent no-ops or fake success states. Static sample content belongs only in explicitly labelled development fixtures.

## 8. Development phases and gates

The phase numbering is organizational; audit existing work and resume the earliest failing dependency instead of rebuilding completed code.

| Phase | Required implementation and exit evidence |
|---|---|
| 1 — Repository | Compatible pinned toolchain, workspace packages, runtime exports, strict TypeScript, ESLint/formatting, env examples, lockfile, runnable scripts; install/typecheck/lint/build pass |
| 2 — Infrastructure | PostgreSQL roles/databases, RabbitMQ, Redis, local SMTP catcher, volumes and health checks; dependencies start and readiness checks pass |
| 3 — Authentication | Real registration/session flows plus browser pages/client; auth, rotation, CSRF, revocation and invalid-credential tests pass |
| 4 — Organization/users | Onboarding, branches/departments/teams, employee profiles, roles, invitations and frontend; two-tenant and escalation tests pass |
| 5 — HR | Attendance, leave, balances, performance and pages; concurrency and date/balance rules tested |
| 6 — Projects | Projects/members/tasks/comments/activity and pages; assignment, access and calculated progress tested |
| 7 — CRM | Leads/conversion, clients/contacts, pipelines/deals/activities and pages; idempotent conversion and won-event tests pass |
| 8 — Finance | Invoice detail/print, exact totals, expenses/payments and pages; duplicate/concurrent payment and status tests pass |
| 9 — Documents | Real storage, upload/download/share/delete and UI; traversal, foreign-tenant and storage-failure tests pass |
| 10 — Events/notifications | Outbox/inbox, broker retries, in-app center, preferences and email delivery; actual event and recovery flows tested |
| 11 — Analytics | Permission-aware dashboard/charts with real aggregates and visible partial failure; numbers verified against fixtures |
| 12 — Audit/API/operations | Durable audit trail, viewer, OpenAPI, request logs, readiness, graceful shutdown and operational docs verified |
| 13 — Full acceptance | Unit/integration/browser/critical-flow checks, typecheck, lint, build and clean-install checks pass; no material unresolved failures |
| 14 — Docker/release | Fresh isolated Compose build, checked-in migrations, seed, all health checks and browser journeys pass; reproducible runbook and honest readiness report |

Run targeted checks during development, then the complete applicable gate. Never disable strictness, add blanket lint ignores, replace real libraries with loose type declarations, rewrite tests to accept broken behavior or add mocks to production code. Test doubles are appropriate for focused unit tests, not proof of database/broker/HTTP integration.

## 9. Required acceptance suite

Use an isolated test database and mailbox, deterministic clocks where appropriate, cleanup and unique test identities. Never reset a database that is not explicitly designated disposable.

- Register/login/invalid login/refresh/logout; expired tokens, refresh replay, reset token expiry/reuse, verification and revoked sessions.
- Permissions, role changes, membership deactivation, own-versus-org access and every cross-tenant read/write/reference/download/aggregate path.
- Employee create/update/deactivate and invitation delivery/acceptance. No mandatory invitation step may be skipped and still reported as full E2E.
- Clock in/out including concurrent clock-in; leave request/approve/reject/cancel, overlap, self-approval, concurrent approvals and balance restoration.
- Project/member/task/assign/comment/complete; CRM lead/convert/deal/won; exact invoice calculations/payment/status and duplicate/concurrent payments.
- Multipart upload/download content round-trip, document permissions, notification preferences/unread count, durable audit and broker retry/deduplication.
- Browser protected routes, forbidden states, form validation, mobile navigation, notification deep links and essential invoice/task actions.

The complete business journey must run through real services and persistence:

Owner registers → company and owner membership created → owner logs in → departments/teams configured → employee invited through local email → employee accepts and logs in → employee clocks in → project manager creates project and assigns task → employee sees notification and completes task → employee requests leave → eligible manager approves and balance changes → sales user creates/converts lead → deal is won → finance user creates/sends invoice and records payments → invoice status, analytics, notifications and audit update → employee clocks out and logs out.

Repeat relevant checks with a second organization and restricted roles. Use at least one real browser critical journey and an API integration suite for broader coverage. Poll eventual state with a bounded timeout; do not rely on arbitrary sleeps.

## 10. Reproducible delivery

Supply `.env.example` with documented non-secret placeholders, a checked-in compatible lockfile, migrations, deterministic development seeding, Dockerfiles/Compose, CI, OpenAPI, role/access matrix, event catalogue, architecture decisions and a README a new developer can follow. Provide cross-platform setup commands suitable for Windows as well as macOS/Linux. Local secret generation may create ignored `.env` files; never package them.

Seed at least one labeled development organization, every supported role, employees, departments/teams, projects/tasks, leads/clients/deals, invoices/payments/expenses, attendance/leave, actual document fixtures, notifications and audit records. Use the same service boundaries/domain rules as normal writes. Do not rely on shared public demo credentials or insert metadata for nonexistent files.

Required root commands: install, dev, build, typecheck, lint, unit/integration tests, browser E2E, migration deployment, seed, infrastructure up/down and full Compose verification. Commands must describe their prerequisites and fail with actionable messages. Do not make normal test commands invoke a destructive reset or require a live production account.

Before calling V1 complete, prove a clean checkout can install, generate clients, migrate an empty isolated database, build, start all services and frontend, seed and execute the full acceptance journey. Record restore/backup instructions and unresolved risks. If Docker, network, credentials or another dependency blocks execution, deliver the code and an exact blocker report with the next runnable command. Distinguish **implemented** from **verified** in every summary.

Start now: inspect the repository and environment, write the status matrix and a concise plan for the earliest unfinished phase, then implement and verify it. Continue while meaningful authorized work remains possible.
