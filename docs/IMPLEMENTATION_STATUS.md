# Implementation and release status — 2026-09-23

This is a substantial application revision, not a claim that every acceptance criterion in BUILD_PROMPT.md is complete.

## Added in this revision

React/Vite frontend with typed API calls, React Router, TanStack Query, React Hook Form, Zod validation, responsive styling, and server-derived permission navigation. All visible record actions call real endpoints. New APIs cover branches, performance reviews, payments listing, and notification preferences. Account email flows use a persistent encrypted queue and SMTP worker. Browser refresh tokens use HttpOnly cookies with origin checks; JWT verification pins algorithm, issuer, audience, and claim shape. Runtime authorization checks active sessions and current organization membership. Refresh rotation uses a conditional write.

Finance uses decimal columns and decimal arithmetic for line totals. Payment recording uses a serializable transaction, bounded conflict retry, overpayment protection, and optional idempotency keys; the UI supplies a stable key for payment retries. Summary queries are currency-scoped, defaulting to USD. Invitation consumption checks status and expiry before creating membership in one transaction. HR list routes scope non-manager reads to the caller.

Event publication now persists a local delivery spool instead of silently falling back to logging. Broker confirms precede file removal. Notification consumption has prefetch, reconnect, delayed retries, a dead-letter queue, persisted deduplication, and preference checks. Four incremental migrations, a public route catalog, local run instructions, and CI integration/browser jobs are included.

## Remaining work before the full master specification is satisfied

1. Run and fix the complete stack against real PostgreSQL, Redis, RabbitMQ, SMTP/Mailpit and browsers. Docker and service binaries are unavailable in this execution environment; Chromium download failed. Migrations were generated but not deployed here.
2. Replace the delivery spool with a **transactional database outbox** coordinated with each domain write. The current spool survives broker outages after enqueue, but a crash between a domain commit and enqueue can still lose an event. Email token creation and enqueue also span a failure boundary. Audit consumption does not yet have notification-consumer retry/deduplication parity.
3. Complete real-database concurrency tests and repairs for leave balance approval/cancellation, attendance clock-in uniqueness, invoice editing/cancellation, and lead conversion. The new payment transaction requires live concurrency validation too. In-memory test doubles are not proof of database isolation.
4. Complete cross-service tenant-reference validation across all employee, owner, client, manager and membership relationships, plus fine-grained project/task/document access rules. Current document access is organization-wide for document.read holders; sharing is notification metadata, not a private-document ACL.
5. Finish richer feature-specific UX: drag-and-drop boards, full project membership management, self-profile editing, session management, payment reversal/credit workflow, richer filtering/sorting, invoice line-item editing/print layout, complete deep links for every notification type, and dashboard charts. Existing shared record views are functional but do not cover every specialized interaction in the master prompt.
6. Complete full request/response OpenAPI schemas, browser accessibility review, deployment hardening, backup/restore drills, and performance/load tests. The current OpenAPI document is a route/authentication catalog, not a complete client-generation contract.

The source and tests make these gaps reviewable. They are not replaced with simulated production behavior or marked as passed.
