# Verification

Run `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm check:all` for local gates. See the delivered verification report for the last executed results.

The earlier backend checkpoint passed 206 unit/service/gateway tests. This revision adds browser-cookie, frontend form, and payment safety tests. Most domain tests use in-memory database doubles. Frontend tests use jsdom. Gateway tests make real local HTTP calls to test proxy behavior.

The new Docker integration workflow and Playwright suites are checked in but were not run to completion here: Docker is unavailable and Chromium could not be downloaded. No successful SMTP delivery, real database migration deployment, broker retry, or end-to-end acceptance is claimed from unit tests.

`pnpm test:e2e` now goes through the gateway and reads the actual invitation email from Mailpit; the former manual-token/skip bridge has been removed. See Mailpit's API contract: https://mailpit.axllent.org/docs/api-v1/.
