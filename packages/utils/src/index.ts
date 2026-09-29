/**
 * @nexora/utils
 *
 * Small, dependency-free helpers reused across services. Keep this package
 * free of framework-specific types (Express, Prisma, ...) so it stays
 * trivially reusable and testable; framework glue belongs in the
 * service that uses it.
 */

import type { PaginationMeta, PaginationParams } from "@nexora/types";
import { createHash } from "node:crypto";
export { omitUndefined, toJsonValue, toJsonObject } from "./objects.js";
export type { Defined, JsonObject, JsonValue } from "./objects.js";

/** crypto.randomUUID is available natively in Node 20+, no dependency needed. */
export function generateId(): string {
  return crypto.randomUUID();
}

export function buildPaginationMeta(params: PaginationParams, total: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / params.pageSize);
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages,
  };
}

/** Prisma-style skip/take derived from a 1-indexed page + pageSize. */
export function toSkipTake(params: PaginationParams): { skip: number; take: number } {
  return {
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
  };
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function assertNever(value: never, message = "Unhandled case"): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

/** Deterministic one-way hash for storing high-entropy tokens (refresh
 * tokens, password-reset tokens, email-verification tokens, invitation
 * tokens) so the raw value never sits in the database - hash whatever the
 * client presents and compare hashes. Not for passwords (those use bcrypt
 * in @nexora/auth) - these values are already random/unguessable, so a
 * fast hash is appropriate and avoids needless bcrypt cost per request. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Parses simple duration strings like "15m", "30d", "1h", "45s" into
 * milliseconds. Used for JWT/session TTLs (JWT_ACCESS_TOKEN_TTL,
 * JWT_REFRESH_TOKEN_TTL, ...) so services can compute real `expiresAt`
 * dates instead of hardcoding numbers in two places.
 */
const DURATION_UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(
      `Invalid duration string "${duration}" - expected e.g. "15m", "30d", "1h", "45s"`,
    );
  }
  const [, amountRaw, unit] = match;
  const amount = Number(amountRaw);
  const unitMs = DURATION_UNIT_MS[unit as string];
  if (unitMs === undefined) {
    throw new Error(`Invalid duration unit in "${duration}"`);
  }
  return amount * unitMs;
}

/**
 * Wraps an async Express handler so rejected promises reach Express's error
 * middleware instead of crashing the process. Typed loosely against
 * (req, res, next) => Promise<void> so it has no hard dependency on the
 * `express` package here; services import this with their own Express types.
 */
export function asyncHandler<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
): (...args: TArgs) => void {
  return (...args: TArgs): void => {
    const next = args[args.length - 1] as (err?: unknown) => void;
    fn(...args).catch(next);
  };
}
