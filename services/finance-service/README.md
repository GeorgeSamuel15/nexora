# finance-service

Owns invoices/invoice items, expenses, and payments. Per the build spec:
**no real payment gateway in V1** - payments here are internal records of
money received (e.g. by bank transfer, check, or externally-processed
card payment), not a Stripe/PayPal integration. `clientId` is an opaque
reference to crm-service's `Client.id`; `createdBy`/`submittedBy`/
`reviewedBy`/`recordedBy` are opaque references to auth-service's `userId`.

## Endpoints

| Method    | Path                               | Permission                                                                 |
| --------- | ---------------------------------- | -------------------------------------------------------------------------- |
| POST/GET  | `/invoices`                        | POST: `invoice.create`. GET: `finance.read`                                |
| GET/PATCH | `/invoices/:id`                    | GET: `finance.read`. PATCH: `invoice.update`, DRAFT only                   |
| PUT       | `/invoices/:id/items`              | `invoice.update`, DRAFT only - replaces all items, recomputes totals       |
| POST      | `/invoices/:id/send`               | `invoice.update` - DRAFT → SENT                                            |
| POST      | `/invoices/:id/cancel`             | `invoice.update` - blocked once PAID                                       |
| GET       | `/invoices/:id/payments`           | `finance.read`                                                             |
| POST      | `/payments`                        | `payment.create` - only against SENT/PARTIALLY_PAID/OVERDUE invoices       |
| GET       | `/payments/:id`                    | `finance.read`                                                             |
| POST/GET  | `/expenses`                        | POST: any authenticated user (self-scoped submission). GET: `finance.read` |
| POST      | `/expenses/:id/approve`, `/reject` | `finance.manage`                                                           |
| GET       | `/reports/summary`                 | `finance.read` - real aggregate totals, not hardcoded                      |

## Invoice status: how it actually moves

Only two transitions are **manual actions**: `DRAFT → SENT` and
`→ CANCELLED` (blocked once `PAID`). Everything else is derived
automatically from recorded payments, recomputed both right after a
payment is recorded and opportunistically whenever an invoice is fetched
(there's no job scheduler in V1, so overdue detection happens as
"read-time repair" rather than a cron sweep):

- payments sum ≥ total → `PAID`
- `0 <` payments sum `< total` → `PARTIALLY_PAID`
- no payments and past `dueDate` → `OVERDUE`
- otherwise stays `SENT`

`DRAFT` and `CANCELLED` are never touched by this logic - only the
explicit actions above change them.

## Business rules enforced

- **Invoice totals are computed from items, never trusted from the
  client**: `subtotal = Σ(quantity × unitPrice)`, `total = subtotal + tax`.
  Recomputed on creation and on every item edit.
- **Items can only be edited while DRAFT** - once sent, an invoice's line
  items are locked; only `dueDate`/`tax`/`notes` remain editable via
  `PATCH`, and even that's DRAFT-only too.
- **Payments can't be recorded against DRAFT, PAID, or CANCELLED
  invoices** - only SENT/PARTIALLY_PAID/OVERDUE are payable states.
- **Duplicate invoice numbers are rejected** per organization (not
  globally - two different orgs can both have an "INV-001").
- **Expense review is single-shot**: approving or rejecting an
  already-reviewed expense is rejected, not silently overwritten.

## Events

`INVOICE_CREATED` (on creation) and `PAYMENT_RECEIVED` (on recording a
payment) both publish through `@nexora/events`'s `EventPublisher`
interface - the same seam introduced in crm-service for `DEAL_WON`. Real
RabbitMQ wiring is Phase 10; today the default publisher logs what would
be sent. Tests capture the exact event payloads via a fake publisher.

## What's tested

`tests/invoice.service.test.ts`: item-total computation, duplicate
invoice-number rejection, send/cancel state machine, item-editing
restricted to DRAFT, `INVOICE_CREATED` event, OVERDUE read-time detection
(including that a DRAFT invoice is never marked overdue), and tenant
isolation.

`tests/payment.service.test.ts`: the payable-status guard (rejecting
DRAFT and CANCELLED targets), PARTIALLY_PAID and PAID transitions,
`PAYMENT_RECEIVED` event, and payment listing order.

`tests/expense.service.test.ts`: submission, approve/reject with
reviewer/timestamp recording, single-shot review enforcement, org
scoping, and `reports/summary`'s aggregate math (including that a
still-PENDING expense doesn't count toward approved totals).

Same verification caveat as every other service: written and type-checked
against the real `@nexora/*` packages, never actually executed here (no
network for `pnpm install`).

Run for real:

```bash
pnpm install
pnpm --filter @nexora/finance-service prisma:migrate -- --name init
pnpm --filter @nexora/finance-service test
pnpm --filter @nexora/finance-service typecheck
```
