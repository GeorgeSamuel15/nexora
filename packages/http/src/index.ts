/**
 * @nexora/http
 *
 * Shared Express middleware used by every service: request-id tagging,
 * the domain error hierarchy + centralized error handler, JWT
 * authentication, permission checks, body/query validation, and a
 * Redis-backed rate limiter. Extracted from auth-service (Phase 3) once
 * organization-service (Phase 4) needed the identical pattern - one place
 * to fix a bug instead of eleven.
 */
export * from "./requestId.js";
export * from "./errors.js";
export * from "./authenticate.js";
export * from "./internalServiceAuth.js";
export * from "./requirePermission.js";
export * from "./validate.js";
export * from "./rateLimit.js";
