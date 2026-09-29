/**
 * @nexora/types
 *
 * Shared, framework-agnostic TypeScript types used across every Nexora
 * service and the frontend. Nothing in this package depends on Express,
 * Prisma, or any specific transport - it is pure type/shape definitions
 * so services can agree on contracts without importing each other's code.
 */

// ---------------------------------------------------------------------------
// Tenancy / identity primitives
// ---------------------------------------------------------------------------

export type UUID = string;

/** Fields every tenant-owned record must carry. Never trust these values
 * when they arrive from a client - they must be derived from the
 * authenticated server-side session (see @nexora/auth). */
export interface TenantScoped {
  organizationId: UUID;
}

export interface BaseEntity extends TenantScoped {
  id: UUID;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Roles & permissions (see build spec section 6)
// ---------------------------------------------------------------------------

export const ROLES = [
  "OWNER",
  "ADMIN",
  "HR_MANAGER",
  "FINANCE_MANAGER",
  "SALES_MANAGER",
  "PROJECT_MANAGER",
  "EMPLOYEE",
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export const PERMISSIONS = [
  "employee.read",
  "employee.create",
  "employee.update",
  "employee.delete",
  "attendance.read",
  "attendance.manage",
  "leave.read",
  "leave.request",
  "leave.approve",
  "leave.reject",
  "leave.configure",
  "project.read",
  "project.create",
  "project.update",
  "project.delete",
  "task.read",
  "task.create",
  "task.assign",
  "task.update",
  "crm.read",
  "crm.manage",
  "finance.read",
  "finance.manage",
  "invoice.create",
  "invoice.update",
  "payment.create",
  "document.read",
  "document.upload",
  "document.delete",
  "audit.read",
  "organization.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// ---------------------------------------------------------------------------
// Pagination (build spec section 28)
// ---------------------------------------------------------------------------

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// API envelope / error format (build spec section 25)
// ---------------------------------------------------------------------------

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  success: false;
  error: ApiErrorShape;
}

export type ApiResponse<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export function apiSuccess<T>(data: T): ApiSuccessEnvelope<T> {
  return { success: true, data };
}

export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorEnvelope {
  return {
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

// ---------------------------------------------------------------------------
// Authenticated request context (populated by auth middleware, never by the client)
// ---------------------------------------------------------------------------

export interface AuthenticatedContext {
  userId: UUID;
  organizationId: UUID;
  role: Role;
  permissions: Permission[];
  sessionId: UUID;
}
