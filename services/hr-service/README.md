# hr-service

Owns attendance and leave: clock in/out, leave types, leave balances, and
leave requests with an approval workflow. Does not own employee profile
data (user-service) or organizations/departments/teams (organization-service).

## Design decision: `employeeId` here is the auth userId

Every record in this service uses the caller's auth-service `userId`
(from the verified JWT) as `employeeId` - **not** user-service's internal
`Employee.id` primary key. Clock-in/out is a hot, self-service action;
requiring a synchronous call to user-service to resolve an identifier on
every punch would add latency and a new failure mode for no real benefit,
since the JWT already carries a stable, trustworthy identifier for "this
person." Displaying employee names alongside attendance/leave data (e.g.
an HR dashboard) is left to the frontend/gateway layer, which can join
this service's `employeeId` against user-service's `Employee.userId`.

Revisit this if a future requirement needs HR data to survive a user
losing their auth account while keeping an employee record (rare, and not
described in the build spec).

## Endpoints

All require a Bearer access token.

| Method     | Path                          | Permission                          | Notes                                                                                              |
| ---------- | ----------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| POST       | `/attendance/clock-in`        | none (self-scoped)                  | Fails if already clocked in                                                                        |
| POST       | `/attendance/clock-out`       | none (self-scoped)                  | Fails if not clocked in                                                                            |
| GET        | `/attendance/me`              | none (self-scoped)                  | Own history, paginated                                                                             |
| GET        | `/attendance`                 | `attendance.read`                   | Org-wide, filterable by employee/date range                                                        |
| GET        | `/leave-types`                | none                                | Any member can see available types                                                                 |
| POST/PATCH | `/leave-types`                | `leave.configure`                   | New permission - the spec says "Administrators should configure leave types" but didn't define one |
| GET        | `/leave-balances/me`          | none (self-scoped)                  | `?year=` optional, defaults to current year                                                        |
| POST       | `/leave-requests`             | none (self-scoped)                  | Validates duration, overlap, and balance                                                           |
| GET        | `/leave-requests/me`          | none (self-scoped)                  | Own requests, paginated                                                                            |
| POST       | `/leave-requests/:id/cancel`  | none (ownership checked in service) | Only PENDING/APPROVED can be cancelled; restores balance if it was APPROVED                        |
| GET        | `/leave-requests`             | `leave.read`                        | Org-wide, filterable by employee/status                                                            |
| PATCH      | `/leave-requests/:id/approve` | `leave.approve`                     | Re-checks balance at approval time, not just at request time                                       |
| PATCH      | `/leave-requests/:id/reject`  | `leave.reject`                      | Optional `rejectionReason`                                                                         |

## Business rules enforced

- **No double clock-in**: a second `clock-in` while a record is `ACTIVE`
  is rejected. `clock-out` is rejected if there's no active record.
  Clock-out timestamps are always server-generated (`now()`), so "clocking
  out before clocking in" can't happen by construction - there's no
  client-supplied timestamp to validate in V1.
- **Leave duration**: computed as inclusive calendar days between
  start/end (no business-day/holiday exclusion - not in scope).
- **Overlap prevention**: a new request can't overlap an already-**APPROVED**
  request for the same employee (matches the spec's literal wording -
  overlapping PENDING requests are allowed, since only one can ultimately
  be approved).
- **Balance checking**: only for leave types with `requiresBalance: true`
  (e.g. Annual, Sick) - not for unlimited types (e.g. Unpaid). Balances
  are lazily provisioned per (employee, leave type, year) on first use,
  seeded from the leave type's `defaultAnnualDays`, rather than
  pre-created for every employee.
- **Balance is re-checked at approval time**, not just at request time -
  if two requests were pending and approving both would overrun the
  balance, the second approval fails with a clear `ConflictError` instead
  of silently overdrawing.
- **Cancellation restores balance**: cancelling an `APPROVED` request adds
  the days back; cancelling a `PENDING` one is a no-op on balance (nothing
  was deducted yet). Only the request's own employee can cancel it, and
  only from `PENDING`/`APPROVED` (not an already-terminal state).

## Events (Phase 10)

`requestLeave`/`approveLeaveRequest`/`rejectLeaveRequest` publish
`LEAVE_REQUESTED`/`LEAVE_APPROVED`/`LEAVE_REJECTED` through
`@nexora/events`, each notifying the employee (not the approver - the
event payloads only carry the employee's id, see
`notification-service/README.md`'s honest accounting of that gap).

## What's tested

`tests/attendance.service.test.ts`: clock in/out state machine, rejecting
double clock-in and clock-out-without-clock-in, per-employee independence,
and org-scoped listing.

`tests/leave.service.test.ts`: leave type uniqueness per org, duration
computation, balance-exceeded rejection, unpaid-type balance bypass,
approved-overlap rejection (with pending-overlap explicitly allowed),
balance deduction on approve, re-approval rejection, reject-with-reason,
cancel with and without balance restoration, ownership enforcement on
cancel, and tenant isolation for approve/reject/view/list.

Same caveat as every other service so far: written and type-checked
against the real `@nexora/*` packages (with loose stubs for external npm
packages not installed in this sandbox), never actually executed here. One
real gap was caught while writing the fake Prisma client - `leaveRequest.findFirst`
initially only supported direct id lookup and didn't handle the date-range
shape the overlap-detection query actually uses, which would have made the
overlap tests pass for the wrong reason (never really exercising the
check). Fixed before writing the tests that depend on it.

Run for real:

```bash
pnpm install
pnpm --filter @nexora/hr-service prisma:migrate -- --name init
pnpm --filter @nexora/hr-service test
pnpm --filter @nexora/hr-service typecheck
```
