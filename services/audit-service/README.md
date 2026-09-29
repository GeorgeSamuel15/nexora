# audit-service

Records "important actions" (build spec section 4) via two independent
paths, and exposes a read-only viewer. An audit trail that can be edited
or deleted isn't one - there is no update or delete endpoint here, only
`recordEntry` (called internally) and `listAuditLogs` (read-only).

## Endpoints

| Method | Path                   | Permission                      | Notes                                                |
| ------ | ---------------------- | ------------------------------- | ---------------------------------------------------- |
| GET    | `/audit-logs`          | `audit.read`                    | Paginated, filterable by actor/entity/action         |
| POST   | `/internal/audit-logs` | internal secret, not a user JWT | Called by `@nexora/audit-client` from other services |

## Two paths into the same table, and why

**Path 1 - event-sourced.** A second RabbitMQ queue (`audit-service.events`),
bound to the _same_ `nexora.events` topic exchange notification-service
already consumes from. Topic exchanges support exactly this: multiple
independent consumers, each with their own durable queue, all receiving
every matching message. Losing audit-service doesn't affect
notification-service's queue or vice versa. Every event that exists on
the bus (from Phase 10) already represents an important operation, so
`mapEventToAuditEntry` (see below) maps all ten of them - unlike
notification-service's mapper, none return "no entry needed."

**Path 2 - direct calls.** Several actions the build spec explicitly
calls out for auditing have **no corresponding event**: login/logout,
employee creation/updates, role changes, document deletion. Rather than
expanding the event contract (a bigger, riskier change touching every
consumer of `@nexora/events`, including notification-service), these are
recorded via direct calls to the new `@nexora/audit-client` package at
their call sites - see "What's wired so far" below.

```
                    |--> notification-service's queue (Phase 10)
RabbitMQ exchange --|
 "nexora.events"    |--> audit-service's queue (this phase)

Direct calls (login, employee CRUD, ...) --> POST /internal/audit-logs --> same audit_logs table
```

## What's wired so far (direct calls)

- **auth-service**: `LOGIN`, `LOGOUT`
- **organization-service**: `MEMBERSHIP_ROLE_CHANGED`, `MEMBERSHIP_REMOVED`
- **user-service**: `EMPLOYEE_CREATED`, `EMPLOYEE_UPDATED`, `EMPLOYEE_DEACTIVATED`
- **document-service**: `DOCUMENT_DELETED`

**Not wired**, and worth naming rather than leaving implicit: invoice
updates, project changes/creation, and document access (view/download)
logging. The pattern for adding any of these is identical to what's
already wired - construct an `AuditClient` at the service's entry point,
call `.record()` after the operation succeeds - it's mechanical, not
architecturally uncertain, and left as a follow-up rather than done
exhaustively across eleven services in this pass.

## Audit logging never blocks the actual operation

`@nexora/audit-client`'s HTTP implementation never throws - a failed or
unreachable audit-service logs a warning and the calling service's real
operation (the login, the employee update) proceeds normally. A missing
audit trail is a problem to notice and fix; it must never be the reason
someone can't log in.

## What's tested

`tests/eventMapper.test.ts` - like notification-service's mapper,
`mapEventToAuditEntry` has zero runtime dependencies (`NexoraEvent` and
`AuditEntry` are both type-only imports) and was genuinely **executed**
via `tsx` against all ten event types during development, not just
type-checked - confirming each one's actor/entity mapping, including two
honest edge cases: `TASK_ASSIGNED`'s actor is the assigner (not the
assignee who receives the task), and `PAYMENT_RECEIVED` uses `"system"`
as the actor since that event carries no actor field at all.

`tests/audit.service.test.ts` - recording, filtering by
actor/entity/action independently, metadata defaulting, and tenant
isolation. Uses the standard fake-Prisma pattern (type-checked, not
executed - `@nexora/http` pulls in `zod`).

`consumer.ts` and the real RabbitMQ connection are, like
notification-service's, written against the real `amqplib` API but not
tested beyond type-checking - the actual logic (`mapEventToAuditEntry`)
is independently verified, which is what matters most.

Run for real:

```bash
pnpm install
pnpm --filter @nexora/audit-service prisma:migrate -- --name init
pnpm --filter @nexora/audit-service test
pnpm --filter @nexora/audit-service typecheck
```
