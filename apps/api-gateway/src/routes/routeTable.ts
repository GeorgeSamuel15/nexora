/**
 * The gateway's entire routing surface, in one table.
 *
 * Build spec section 19 is explicit that the gateway must NOT contain
 * business logic - so this file is pure configuration: which public
 * prefix maps to which service, and which paths are reachable without a
 * token. Everything else (authorization, validation, domain rules) stays
 * in the owning service, where it's already implemented and tested.
 */

export interface RouteDefinition {
  /** Public path prefix, e.g. "/api/hr" */
  prefix: string;
  /** Target service base URL */
  target: string;
  /**
   * Path rewrite applied before forwarding. Services mount their routers
   * at domain-specific paths (hr-service serves /attendance and
   * /leave-requests, not /hr/attendance), so the gateway strips its own
   * prefix rather than requiring every service to know it sits behind a
   * gateway.
   */
  stripPrefix: string;
  /** If true, requests must carry a valid access token. */
  requiresAuth: boolean;
}

export interface BuildRoutesConfig {
  authServiceUrl: string;
  organizationServiceUrl: string;
  userServiceUrl: string;
  hrServiceUrl: string;
  projectServiceUrl: string;
  crmServiceUrl: string;
  financeServiceUrl: string;
  documentServiceUrl: string;
  notificationServiceUrl: string;
  analyticsServiceUrl: string;
  auditServiceUrl: string;
}

/**
 * Paths under /api/auth that must work WITHOUT a token - you can't
 * present an access token to the endpoint that issues your first one.
 * Everything else under /api/auth (notably /me) still requires auth,
 * which is why auth can't simply be disabled for the whole prefix.
 */
export const PUBLIC_AUTH_PATHS = [
  "/register",
  "/login",
  "/refresh",
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/accept-invitation",
] as const;

export function buildRoutes(config: BuildRoutesConfig): RouteDefinition[] {
  return [
    { prefix: "/api/branches", target: config.organizationServiceUrl, stripPrefix: "/api", requiresAuth: true },
    { prefix: "/api/performance-reviews", target: config.hrServiceUrl, stripPrefix: "/api", requiresAuth: true },
    // Auth is special: mixed public/protected, handled per-path by the
    // gateway's auth middleware (see app.ts), not by a blanket flag.
    {
      prefix: "/api/auth",
      target: config.authServiceUrl,
      stripPrefix: "/api",
      requiresAuth: false,
    },

    {
      prefix: "/api/organizations",
      target: config.organizationServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/departments",
      target: config.organizationServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/teams",
      target: config.organizationServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/memberships",
      target: config.organizationServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/invitations",
      target: config.organizationServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },

    {
      prefix: "/api/employees",
      target: config.userServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },

    {
      prefix: "/api/attendance",
      target: config.hrServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/leave-types",
      target: config.hrServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/leave-requests",
      target: config.hrServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/leave-balances",
      target: config.hrServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },

    {
      prefix: "/api/projects",
      target: config.projectServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/tasks",
      target: config.projectServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },

    { prefix: "/api/leads", target: config.crmServiceUrl, stripPrefix: "/api", requiresAuth: true },
    {
      prefix: "/api/clients",
      target: config.crmServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/pipelines",
      target: config.crmServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    { prefix: "/api/deals", target: config.crmServiceUrl, stripPrefix: "/api", requiresAuth: true },

    {
      prefix: "/api/invoices",
      target: config.financeServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/payments",
      target: config.financeServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/expenses",
      target: config.financeServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/reports",
      target: config.financeServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },

    {
      prefix: "/api/documents",
      target: config.documentServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/notifications",
      target: config.notificationServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/dashboard",
      target: config.analyticsServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
    {
      prefix: "/api/audit-logs",
      target: config.auditServiceUrl,
      stripPrefix: "/api",
      requiresAuth: true,
    },
  ];
}

/** Every service the gateway fronts, for the aggregated health check. */
export function healthTargets(config: BuildRoutesConfig): { name: string; url: string }[] {
  return [
    { name: "auth-service", url: config.authServiceUrl },
    { name: "organization-service", url: config.organizationServiceUrl },
    { name: "user-service", url: config.userServiceUrl },
    { name: "hr-service", url: config.hrServiceUrl },
    { name: "project-service", url: config.projectServiceUrl },
    { name: "crm-service", url: config.crmServiceUrl },
    { name: "finance-service", url: config.financeServiceUrl },
    { name: "document-service", url: config.documentServiceUrl },
    { name: "notification-service", url: config.notificationServiceUrl },
    { name: "analytics-service", url: config.analyticsServiceUrl },
    { name: "audit-service", url: config.auditServiceUrl },
  ];
}
