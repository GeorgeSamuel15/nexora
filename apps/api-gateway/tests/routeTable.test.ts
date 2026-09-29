import { describe, expect, it } from "vitest";
import {
  buildRoutes,
  healthTargets,
  PUBLIC_AUTH_PATHS,
  type BuildRoutesConfig,
} from "../src/routes/routeTable.js";

/**
 * routeTable.ts has zero runtime dependencies (pure config + functions),
 * so this suite was actually executed during development, not just
 * type-checked - see apps/api-gateway/README.md.
 *
 * The auth-gating assertions here matter more than most: a route
 * accidentally marked public is a silent authentication bypass, and
 * nothing else in the stack would catch it.
 */

const config: BuildRoutesConfig = {
  authServiceUrl: "http://auth:4001",
  organizationServiceUrl: "http://org:4002",
  userServiceUrl: "http://user:4003",
  hrServiceUrl: "http://hr:4004",
  projectServiceUrl: "http://project:4005",
  crmServiceUrl: "http://crm:4006",
  financeServiceUrl: "http://finance:4007",
  documentServiceUrl: "http://document:4008",
  notificationServiceUrl: "http://notification:4009",
  analyticsServiceUrl: "http://analytics:4010",
  auditServiceUrl: "http://audit:4011",
};

describe("route table", () => {
  it("requires auth on every route except the mixed /api/auth prefix", () => {
    const unauthenticated = buildRoutes(config).filter((r) => !r.requiresAuth);
    // /api/auth is the ONLY prefix allowed to be non-blanket-auth, because
    // it mixes public (login) and protected (/me) paths - handled per-path
    // by the gateway's authGate. Anything else here is a bypass.
    expect(unauthenticated.map((r) => r.prefix)).toEqual(["/api/auth"]);
  });

  it("maps every route to a real configured service URL", () => {
    const knownTargets = new Set(Object.values(config));
    for (const route of buildRoutes(config)) {
      expect(knownTargets.has(route.target), `${route.prefix} -> ${route.target}`).toBe(true);
    }
  });

  it("has no duplicate or ambiguous prefixes", () => {
    const prefixes = buildRoutes(config).map((r) => r.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("strips /api so services receive the paths they actually mount", () => {
    for (const route of buildRoutes(config)) {
      expect(route.stripPrefix).toBe("/api");
      // e.g. /api/attendance/clock-in -> /attendance/clock-in, which is
      // what hr-service actually serves.
      const rewritten = `${route.prefix}/something`.replace(
        new RegExp(`^${route.stripPrefix}`),
        "",
      );
      expect(rewritten.startsWith("/api")).toBe(false);
      expect(rewritten.startsWith("/")).toBe(true);
    }
  });

  it("treats exactly the token-issuing auth paths as public, and not /me", () => {
    expect(PUBLIC_AUTH_PATHS).toContain("/login");
    expect(PUBLIC_AUTH_PATHS).toContain("/register");
    expect(PUBLIC_AUTH_PATHS).toContain("/refresh");
    expect(PUBLIC_AUTH_PATHS).toContain("/accept-invitation");
    // /me returns the current user and MUST require a token.
    expect(PUBLIC_AUTH_PATHS as readonly string[]).not.toContain("/me");
  });

  it("health-checks every service the gateway fronts", () => {
    const routedTargets = new Set(buildRoutes(config).map((r) => r.target));
    const healthUrls = new Set(healthTargets(config).map((t) => t.url));
    for (const target of routedTargets) {
      expect(healthUrls.has(target), `${target} is routed but not health-checked`).toBe(true);
    }
    expect(healthTargets(config)).toHaveLength(11);
  });
});
