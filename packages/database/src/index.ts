/**
 * @nexora/database
 *
 * Per build spec section 23, every service owns its data and its own
 * Prisma schema - there is intentionally no single shared `schema.prisma`
 * here, and no service should reach into another service's tables
 * directly. What lives in this package is the *pattern* every service
 * follows for its own client, not a shared client instance.
 *
 * Each service (added starting in Phase 3) will have:
 *   services/<name>/prisma/schema.prisma
 *   services/<name>/src/db.ts   <- calls createPrismaSingleton(new PrismaClient())
 *
 * This file is left as a typed factory function, not a real PrismaClient
 * import, because no service schema exists yet in Phase 1 - wiring this to
 * an actual generated client happens the moment the first schema is
 * introduced (auth-service, Phase 3).
 */

/**
 * Generic singleton factory so every service avoids exhausting Postgres
 * connections during `pnpm dev` hot-reloads (a very common Prisma +
 * ts-node-dev footgun). Usage inside a service:
 *
 *   import { PrismaClient } from "@prisma/client";
 *   import { createSingleton } from "@nexora/database";
 *   export const db = createSingleton("auth-service-db", () => new PrismaClient());
 */
const registry = new Map<string, unknown>();

export function createSingleton<TClient>(key: string, factory: () => TClient): TClient {
  const existing = registry.get(key);
  if (existing) {
    return existing as TClient;
  }
  const created = factory();
  registry.set(key, created);
  return created;
}
