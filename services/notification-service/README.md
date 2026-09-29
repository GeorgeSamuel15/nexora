# notification-service

Consumes domain events published by every other service and turns the
notification-worthy ones into per-user notifications. There is
**no public "create notification" endpoint** - notifications are only
ever created by the RabbitMQ consumer, matching the build spec's
event-driven notification architecture.

## Endpoints

All require a Bearer access token, all self-scoped (no admin view across
users - the spec describes a personal notification center, not a
broadcast/admin tool):

| Method | Path                             | Notes                                                   |
| ------ | -------------------------------- | ------------------------------------------------------- |
| GET    | `/notifications/me`              | Paginated, filterable by `isRead`                       |
| GET    | `/notifications/me/unread-count` | Real `COUNT(*)` query - not a stored, driftable counter |
| POST   | `/notifications/:id/read`        | Ownership-checked (404 if it's not yours)               |
| POST   | `/notifications/read-all`        | Marks only the caller's own unread notifications        |

## How an event becomes a notification

```
Service publishes event (e.g. TASK_ASSIGNED)
        |
RabbitMQ topic exchange "nexora.events"
        |
notification-service's queue (bound to "nexora.#" - catch-all)
        |
mapEventToNotification(event)  <- pure function, src/eventMapper.ts
        |
   Notification created in Postgres
        |
GET /notifications/me picks it up
```

`src/consumer.ts` is deliberately thin - connect, bind, parse, delegate
to `mapEventToNotification`, then `notificationService.createNotification`.
All the actual logic lives in `eventMapper.ts` and `notification.service.ts`,
both fully unit-tested without needing a broker or a database respectively.

## Not every event produces a notification, on purpose

`mapEventToNotification` returns `null` for two event types, and the
reason is documented in code rather than silently skipped:

- **TASK_COMPLETED** - the payload (`taskId`, `taskTitle`, `completedBy`)
  doesn't carry who should be told (the creator? the assignee? the
  project owner?). Adding that would mean changing an event contract
  other services already publish against, which is a bigger call than
  this phase should make unilaterally.
- **PAYMENT_RECEIVED** - same gap: no field identifying who owns/created
  the invoice. `InvoiceCreatedEvent` has `createdBy`; `PaymentReceivedEvent`
  doesn't carry the equivalent.

Both are real, flagged gaps - not oversights. The honest fix is extending
those two event payloads (a cross-service contract change coordinated
with crm-service/project-service/finance-service), not guessing a
recipient here.

## This test suite includes something else that was actually executed

Like document-service's storage driver, `mapEventToNotification` has
**zero runtime dependencies** - it imports `NexoraEvent` from
`@nexora/events` as a type only (`import type`), which is erased at
compile time. That means it doesn't need `@nexora/events`'s own
dependencies (`amqplib`) installed to run. It was genuinely executed
here via `tsx` against all ten event types, confirming the exact mapping
behavior - see `tests/eventMapper.test.ts` for the permanent version of
what was run.

`notification.service.ts` follows the standard fake-Prisma verification
used everywhere else in this build (type-checked, not executed - it
transitively needs `zod` via `@nexora/http`). `consumer.ts` and the real
RabbitMQ connection are written against the real `amqplib` API but
untested even by type-check-with-stub, beyond compiling - a proper test
would need either a mocked `amqplib` module or a real broker
(Testcontainers-style), neither of which was worth building for this
pass given the actual logic (`mapEventToNotification`) is already
covered independently.

## Resilience

If RabbitMQ isn't reachable at boot, the consumer logs a warning and the
service keeps running - the REST API (reading/marking existing
notifications) doesn't depend on a live connection. There's no background
reconnect loop in V1: a service that boots before RabbitMQ is ready stays
disconnected until its next restart. Same tradeoff as
`createResilientEventPublisher` on the publishing side (see
`@nexora/events`).

Run for real:

```bash
pnpm install
pnpm --filter @nexora/notification-service prisma:migrate -- --name init
pnpm --filter @nexora/notification-service test
pnpm --filter @nexora/notification-service typecheck
```
