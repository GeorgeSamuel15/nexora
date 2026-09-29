/**
 * @nexora/validation
 *
 * Shared Zod schemas for concerns that repeat across every service:
 * pagination query params, UUID route params, and common primitives.
 * Service-specific schemas (CreateEmployeeSchema, CreateInvoiceSchema, ...)
 * live inside each service and are built starting in later phases -
 * they should compose these primitives rather than duplicate them.
 *
 * Requires `zod` to be installed (`pnpm install` at the repo root).
 */

import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const emailSchema = z.string().trim().toLowerCase().email();

/** Minimum 12 characters; real strength rules are enforced in
 * services/auth-service alongside bcrypt/argon2 hashing (Phase 3). */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128);

export const nonEmptyString = z.string().trim().min(1);

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format");

export const sortOrderSchema = z.enum(["asc", "desc"]).default("desc");

/** Helper for building a consistent list-query schema per resource, e.g.:
 *   const listEmployeesQuerySchema = buildListQuerySchema({
 *     department: z.string().optional(),
 *   });
 */
export function buildListQuerySchema<TExtra extends z.ZodRawShape>(extra: TExtra) {
  return paginationQuerySchema.extend(extra);
}
