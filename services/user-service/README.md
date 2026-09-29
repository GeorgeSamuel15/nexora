# user-service

Owns employee **profile** data only: name, contact info, job title,
department/team references, manager, employment type/status, hire date.
Does not own credentials (auth-service) or departments/teams themselves
(organization-service) - `departmentId`/`teamId` here are opaque
references to organization-service's records, validated against nothing
locally (no cross-service call on every write - see "Known limitation"
below).

## Endpoints

All under `/employees`, Bearer access token required:

| Method | Path             | Permission        | Notes                                                                                                                          |
| ------ | ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/employees`     | `employee.read`   | Paginated, filterable by `departmentId`/`teamId`/`employmentStatus`, free-text `search` across name/email                      |
| POST   | `/employees`     | `employee.create` | Validates `employeeNumber` uniqueness and `managerId` (must be a real employee in the same org)                                |
| GET    | `/employees/:id` | `employee.read`   |                                                                                                                                |
| PATCH  | `/employees/:id` | `employee.update` | Rejects setting an employee as their own manager                                                                               |
| DELETE | `/employees/:id` | `employee.delete` | **Soft delete** - sets `employmentStatus: TERMINATED`, never removes the row (history must stay attributable to a real record) |

## Known limitation (deliberate, documented)

`departmentId`/`teamId` on an Employee are not validated against
organization-service at write time - doing so would mean every employee
create/update makes a synchronous cross-service call for a field that's
often optional. For V1 this is accepted risk: an employee could reference
a department id that gets deleted later, leaving a dangling reference.
`managerId`, by contrast, **is** validated - it's a self-reference within
this same service's data, so the check is a local query, not a network
call. Revisit this once Phase 10's event system exists: organization-service
could publish a `DEPARTMENT_DELETED` event and this service could react by
clearing the reference.

## What's tested

`tests/employee.service.test.ts`: create + duplicate employee-number
rejection, manager validation (including cross-org rejection and
self-management rejection), pagination totals, free-text search, tenant
isolation (Org A cannot read/update/deactivate Org B's employee by id, and
Org B's record is confirmed untouched afterward), and that deactivation is
a status change, not a delete.

Same verification caveat as auth-service and organization-service: written
and syntax/type-checked against the real `@nexora/*` packages, not
actually executed (no network in this environment for `pnpm install`).
One real bug was caught and fixed in the process - the fake Prisma
client's `create()` had an incorrect type that didn't match what the
service actually passes (see the code comment at that fix for detail).

Run for real:

```bash
pnpm install
pnpm --filter @nexora/user-service prisma:migrate -- --name init
pnpm --filter @nexora/user-service test
pnpm --filter @nexora/user-service typecheck
```
