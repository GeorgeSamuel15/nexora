/**
 * @nexora/auth
 *
 * Shared authentication/authorization primitives:
 *  - permissions.ts: role -> permission map, dependency-free, unit-testable today
 *  - tokens.ts:      JWT access/refresh sign & verify (needs jsonwebtoken)
 *  - password.ts:    bcrypt hashing (needs bcrypt)
 *
 * services/auth-service (Phase 3) owns the actual registration/login/session
 * database and HTTP endpoints; this package only owns the reusable logic.
 */

export * from "./permissions.js";
export * from "./tokens.js";
export * from "./password.js";
