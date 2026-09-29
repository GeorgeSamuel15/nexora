# crm-service

Owns leads, clients/contacts, sales pipelines, and deals. `ownerId`/
`actorId` are opaque references to auth-service's `userId` (same
convention as every service since hr-service - see its README).

## Endpoints

All require a Bearer access token, gated by `crm.read` (viewing) or
`crm.manage` (everything else).

| Method     | Path                                                      | Notes                                                                                                                                                        |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST/GET   | `/leads`                                                  |                                                                                                                                                              |
| GET/PATCH  | `/leads/:id`                                              |                                                                                                                                                              |
| POST       | `/leads/:id/convert`                                      | Creates a Client + primary Contact from the lead, sets `status: CONVERTED`. The lead itself is kept (not deleted) as a record of where the client came from. |
| POST/GET   | `/clients`                                                |                                                                                                                                                              |
| GET/PATCH  | `/clients/:id`                                            |                                                                                                                                                              |
| GET/POST   | `/clients/:id/contacts`                                   |                                                                                                                                                              |
| POST/GET   | `/pipelines`                                              | Creating a pipeline seeds its stages in one call (defaults to New/Qualified/Proposal/Negotiation if not specified)                                           |
| GET        | `/pipelines/:id/board`                                    | OPEN deals grouped by stage - see "Pipeline visualization" below                                                                                             |
| POST/PATCH | `/pipelines/:id/stages`, `/pipelines/:id/stages/:stageId` |                                                                                                                                                              |
| POST/GET   | `/deals`                                                  | Validates `clientId` and `stageId` belong to the org/pipeline at creation                                                                                    |
| GET/PATCH  | `/deals/:id`                                              | PATCH rejected once the deal is WON/LOST                                                                                                                     |
| POST       | `/deals/:id/win`                                          | Sets `status: WON`, `probability: 100`, publishes `DEAL_WON`                                                                                                 |
| POST       | `/deals/:id/lose`                                         | Sets `status: LOST`, `probability: 0` - no event published                                                                                                   |
| GET        | `/deals/:id/activities`                                   |                                                                                                                                                              |

## Pipeline visualization

The build spec asks for "sales pipeline visualization" under Phase 7, but
rendering a visual board is a frontend concern (Phase 20). What this
service provides is the data such a board needs:
`GET /pipelines/:id/board` returns the pipeline's stages in order, each
with its list of `OPEN` deals - exactly the shape a kanban-style pipeline
view consumes.

## Deal events

The build spec says "when a deal is marked WON, publish an appropriate
event." Real RabbitMQ wiring is explicitly Phase 10's job, not this one -
so `winDeal` publishes through the `EventPublisher` interface added to
`@nexora/events` in this phase (see that package's `createNoopEventPublisher`),
using the `DealWonEvent` type that was already defined in Phase 1's
scaffolding. Today, the default publisher just logs what _would_ be sent
(including the routing key). When Phase 10 lands, a real RabbitMQ-backed
`EventPublisher` gets injected in `app.ts` and no line of `deal.service.ts`
changes - `tests/deal.service.test.ts` already asserts on the exact event
shape using a capturing fake, so the contract is locked in before the
transport exists.

## Business rules enforced

- **Lead conversion is idempotent-safe**: converting an already-`CONVERTED`
  lead is rejected, not silently repeated (which would create duplicate
  clients).
- **Deals validate their client and stage belong to the same organization
  and pipeline** at creation - a stage id from a different pipeline (even
  in the same org) is rejected, not silently accepted.
- **WON/LOST are terminal**: `updateDeal`, `winDeal`, and `loseDeal` all
  refuse once a deal has left `OPEN` status.
- **Every deal creation and stage change is logged as activity**,
  queryable via `/deals/:id/activities`.

## What's tested

`tests/lead.service.test.ts`: conversion creates a client + primary
contact (with and without a company name), double-conversion rejection,
and tenant isolation.

`tests/deal.service.test.ts`: creation validated against cross-org client
and cross-pipeline stage, the win/lose state transitions (including the
exact `DEAL_WON` event payload via a capturing fake publisher), the
OPEN-only edit/win/lose invariant, and tenant isolation.

Same verification caveat as every other service: written and type-checked
against the real `@nexora/*` packages, never actually executed here (no
network for `pnpm install`).

Run for real:

```bash
pnpm install
pnpm --filter @nexora/crm-service prisma:migrate -- --name init
pnpm --filter @nexora/crm-service test
pnpm --filter @nexora/crm-service typecheck
```
