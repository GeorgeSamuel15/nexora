# api-gateway

The single public entry point. Everything the frontend talks to goes
through `:4000`; the eleven services behind it are not meant to be
publicly reachable in a real deployment.

## What it does — and deliberately does not

Build spec section 19 is explicit: **no business logic in the gateway.**
So this does exactly five things and nothing else:

1. **Routes** `/api/*` to the owning service (`src/routes/routeTable.ts`
   is the entire routing surface, as data)
2. **Authenticates** — verifies the JWT once at the edge, using the same
   `authenticate` middleware from `@nexora/http` every service uses
3. **Rate limits** globally (300/min/IP) as a blunt edge backstop
4. **Propagates request IDs** so one request is traceable across the
   gateway and every service it touches
5. **Aggregates health** — `GET /health` reports the gateway plus all 11
   services, so one call answers "is the platform up?"

Authorization (permissions), validation, and every domain rule stay in
the owning service, where they're already implemented and tested. The
gateway authenticating does **not** make services trust unauthenticated
input — each still verifies the token itself, because a service must
never be compromised by someone bypassing the gateway.

## Two non-obvious decisions

**No `express.json()`.** The gateway proxies raw request streams. Parsing
the body would consume the stream and break both JSON forwarding and
document-service's multipart uploads. The gateway never needs to read a
body — only services do, and they parse it themselves.

**`/api/auth` is auth-gated per-path, not per-prefix.** You can't present
an access token to the endpoint that issues your first one, but
`/api/auth/me` still needs one. So `PUBLIC_AUTH_PATHS` lists exactly the
token-issuing paths and everything else under that prefix requires auth.
This is the one place a mistake would be a silent authentication bypass,
which is why it's tested explicitly.

## What's tested

`tests/routeTable.test.ts` — `routeTable.ts` has zero runtime
dependencies, so this suite was **actually executed**, not just
type-checked. It asserts that `/api/auth` is the only prefix without
blanket auth (anything else appearing there is a bypass), that `/me` is
NOT in the public list, that every route targets a configured service,
that prefixes are unambiguous, that the `/api` strip produces the paths
services actually mount, and that every routed service is covered by the
health check.

`app.ts` itself (proxying, error handling) is type-checked only — it
needs `http-proxy-middleware` and a live upstream to test meaningfully.

## Verify it

```bash
pnpm --filter @nexora/api-gateway test
pnpm --filter @nexora/api-gateway dev    # :4000
curl localhost:4000/health               # gateway + all 11 services
```
