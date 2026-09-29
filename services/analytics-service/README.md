# analytics-service

Builds the main dashboard by aggregating real-time stats from five other
services. **This service owns no database and no Prisma schema** - every
number it returns is fetched live from the service that actually owns
that data, never stored or cached here. That's a deliberate architectural
choice for V1, not an oversight - see "Why no database" below.

## Endpoint

| Method | Path                 | Notes                                                      |
| ------ | -------------------- | ---------------------------------------------------------- |
| GET    | `/dashboard/summary` | The only endpoint this service has. Bearer token required. |

## The internal contract this depends on

Five services now expose a matching internal endpoint (added this phase,
protected by `internalServiceAuth` - the same shared-secret pattern
auth-service has used since Phase 4, not a user JWT):

| Service         | Endpoint                              | Returns                                                                   |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| user-service    | `GET /internal/stats?organizationId=` | `{ totalEmployees, activeEmployees }`                                     |
| hr-service      | `GET /internal/stats?organizationId=` | `{ pendingLeaveRequests }`                                                |
| project-service | `GET /internal/stats?organizationId=` | `{ activeProjects, tasksDue }`                                            |
| crm-service     | `GET /internal/stats?organizationId=` | `{ openDeals }`                                                           |
| finance-service | `GET /internal/stats?organizationId=` | `{ revenue, outstandingInvoicesCount, outstandingAmount, totalExpenses }` |

Every one of these is a real aggregate query (`COUNT`, `SUM`) against that
service's own tables - none of them are hardcoded, per the build spec's
explicit requirement ("Do not hardcode analytics").

## The dashboard adapts to the caller's role (build spec section 21)

`getDashboardSummary` takes the caller's permissions and only fetches
(and returns) sections they're allowed to see - an EMPLOYEE with none of
`employee.read`/`leave.read`/`project.read`/`crm.read`/`finance.read`
gets back `{ unavailableSections: [] }` with nothing else; an OWNER gets
everything. Sections aren't fetched-then-hidden - a section the caller
can't see is never requested from its owning service at all, so there's
no wasted call and no risk of a permission check being "just" cosmetic.

## Resilience: one down service doesn't sink the dashboard

Each permitted section is fetched independently. If a service is
unreachable, that section is dropped into `unavailableSections` and every
other section still returns normally - a dashboard showing four working
widgets and one "temporarily unavailable" is a much better experience
than a 500 because one service was mid-deploy. An unexpected error
(anything other than the specific "couldn't reach the service" case) is
still re-thrown rather than silently swallowed - only genuine
unavailability degrades gracefully, not bugs.

## Why no database

A real analytics platform at scale would likely have a proper data
warehouse or time-series store fed by an ETL pipeline or the event stream
already built in Phase 10. For V1, the build spec's actual bar is "don't
hardcode numbers, don't use fake data" - live aggregation via internal
HTTP calls clears that bar honestly without inventing a database that
would just be a partial, staleness-prone copy of data five other services
already own. This is worth revisiting if dashboard load becomes a
real concern (each dashboard view currently means five outbound HTTP
calls) - a background-refreshed cache would be the natural next step
without changing the public contract.

## What's tested

`tests/dashboard.service.test.ts`: every section present when the caller
has every permission, sections omitted (and their client never even
called) when permission is missing, an empty summary for a caller with
no relevant permissions, graceful per-section degradation when one
service is down (with the other sections still succeeding), and that a
genuinely unexpected error still propagates rather than being swallowed
alongside the expected "service unavailable" case.

This is the **most thoroughly testable service in the build** precisely
because it has no database - `StatsClients` is a plain injectable
interface, so every test above runs against fakes with zero Prisma
mocking needed. Still type-checked rather than executed, though, since it
depends on `@nexora/http` (needs `zod`).

Run for real:

```bash
pnpm install
pnpm --filter @nexora/analytics-service test
pnpm --filter @nexora/analytics-service typecheck
```

Trying it against real running services (once Phase 2's infra and the
five source services are up):

```bash
pnpm --filter @nexora/analytics-service dev   # :4010
curl http://localhost:4010/dashboard/summary -H "Authorization: Bearer <token>"
```
