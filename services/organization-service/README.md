# organization-service

Owns organizations, departments, teams, memberships (userId + role within
an org), and invitations. Does not own credentials (auth-service) or
employee profile fields like name/job title (user-service).

## This is what unblocks auth-service

auth-service's `register` and `login`/`refresh`/`accept-invitation` flows
already call the four internal endpoints below - they were specified in
`services/auth-service/README.md` before this service existed, and this
implementation matches that contract exactly.

## Endpoints

**Internal** (protected by `x-internal-secret`, not user JWTs - see
`@nexora/http`'s `internalServiceAuth`):

| Method | Path                                | Called by auth-service for                        |
| ------ | ----------------------------------- | ------------------------------------------------- |
| POST   | `/internal/organizations/bootstrap` | `register` - creates the org + OWNER membership   |
| POST   | `/internal/memberships/lookup`      | `login` / `refresh` - resolves current org + role |
| POST   | `/internal/invitations/validate`    | `accept-invitation` (step 1, read-only)           |
| POST   | `/internal/invitations/consume`     | `accept-invitation` (step 2, creates membership)  |

**Public** (Bearer access token, permission-gated where noted):

| Method          | Path                             | Requires                                                                   |
| --------------- | -------------------------------- | -------------------------------------------------------------------------- |
| GET             | `/organizations/me`              | any authenticated member                                                   |
| PATCH           | `/organizations/me`              | `organization.manage`                                                      |
| GET/POST        | `/departments`, `/teams`         | GET: any member. POST: `organization.manage`                               |
| PATCH/DELETE    | `/departments/:id`, `/teams/:id` | `organization.manage`                                                      |
| GET             | `/memberships`                   | any authenticated member                                                   |
| PATCH/DELETE    | `/memberships/:id`               | `organization.manage` (blocked if it would leave the org with zero OWNERs) |
| GET/POST/DELETE | `/invitations`                   | `organization.manage`                                                      |

## Tenant isolation

Every department/team/membership/invitation query is scoped by
`organizationId` **inside the WHERE clause itself** (see
`src/services/structure.service.ts` and `membership.service.ts`) - not
fetched first and checked after. A request for another org's resource id
returns `404 NOT_FOUND`, the same response as a truly nonexistent id, so
it doesn't even confirm the id exists.

`tests/tenantIsolation.test.ts` exercises this directly per build spec
section 5's explicit requirement: two organizations are created, and every
cross-org read/update/delete/invite-consume is asserted to fail with
`NotFoundError` while the other org's data is verified untouched.

## What's tested

- `tests/tenantIsolation.test.ts` - cross-org isolation for departments,
  teams, memberships, and invitations (11 tests)
- `tests/organization.service.test.ts` - bootstrap, slug collision
  handling, membership lookup, org settings updates
- `tests/membership-and-invitation.test.ts` - the last-OWNER protection
  (can't demote/remove the only OWNER, but can once a second one exists),
  and the full invitation validate → consume lifecycle including
  double-consume and revoke-then-consume rejection

All against `tests/fakePrisma.ts`, an in-memory Prisma stand-in - same
approach as auth-service, same caveat: **not actually run in this
environment** (no network, no `pnpm install`). What was checked instead:
every file passed a syntax check, and the service's own logic type-checked
cleanly against the real `@nexora/*` packages (only loose stubs for
external npm packages that aren't installed here). This process already
caught two real bugs before they shipped - see "Verification notes" below.

Run for real:

```bash
pnpm install
pnpm --filter @nexora/organization-service prisma:migrate -- --name init
pnpm --filter @nexora/organization-service test
pnpm --filter @nexora/organization-service typecheck
```

## Verification notes (kept for the record)

Two real bugs were caught by type-checking against the real `@nexora/*`
packages before this was ever run:

1. The test fakes for auth-service's `OrganizationClient` didn't implement
   `validateInvitation`/`consumeInvitation` after those methods were added
   - the type-checker flagged it immediately.
2. Every inline route handler here (`asyncHandler(async (req, res) => ...)`)
   had `req`/`res` silently typed as `unknown` because the arrow functions
   had no explicit parameter types and `asyncHandler`'s generic signature
   doesn't propagate contextual types to untyped literals. Fixed by
   annotating every handler as `(req: Request, res: Response)`.

Neither would necessarily have been caught by only reading the code back -
both showed up because the type-checker traced actual usage.

## Events (Phase 10)

`createInvitation` publishes `EMPLOYEE_INVITED` through `@nexora/events`'s
`EventPublisher` - notification-service picks it up and confirms to the
inviter that the invite was sent. Same pattern as crm-service's
`DEAL_WON` and finance-service's `INVOICE_CREATED`/`PAYMENT_RECEIVED`:
tested via a capturing fake publisher (`tests/fakeEventPublisher.ts`),
wired to a real RabbitMQ connection (with logging fallback if
unreachable) at `index.ts`.

## Business rules enforced

- An organization always has exactly one OWNER, assigned at bootstrap;
  invitations and role changes can't create or remove the last OWNER
  (`updateMembershipRole` / `removeMembership` both check
  `countActiveOwners` first).
- Invitations can't be issued for the OWNER role (`invitation.schemas.ts`
  excludes it from the allowed enum).
- Organization slugs are unique; name collisions get a short random
  suffix rather than failing registration.
- Consuming an invitation is safe under a concurrent double-request: the
  underlying `updateMany` only succeeds when `status: "PENDING"`, so a
  second consume attempt sees `count: 0` and fails with `ConflictError`
  instead of creating two memberships.
