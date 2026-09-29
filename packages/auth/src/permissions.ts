import type { Permission, Role } from "@nexora/types";
import { PERMISSIONS } from "@nexora/types";

/**
 * Central role -> permission map. This is the single source of truth for
 * "what can each role do" - services must check permissions through
 * `hasPermission` / `requirePermission`, never by comparing role strings
 * directly, so the rule set can evolve without touching every service.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // OWNER and ADMIN get every permission. Kept explicit (not "*") so the
  // full set is visible here and stays in sync with @nexora/types.
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,

  HR_MANAGER: [
    "employee.read",
    "employee.create",
    "employee.update",
    "attendance.read",
    "attendance.manage",
    "leave.read",
    "leave.approve",
    "leave.reject",
    "leave.configure",
    "document.read",
    "document.upload",
  ],

  FINANCE_MANAGER: [
    "employee.read",
    "finance.read",
    "finance.manage",
    "invoice.create",
    "invoice.update",
    "payment.create",
    "document.read",
    "document.upload",
  ],

  SALES_MANAGER: ["employee.read", "crm.read", "crm.manage", "document.read", "document.upload"],

  PROJECT_MANAGER: [
    "employee.read",
    "project.read",
    "project.create",
    "project.update",
    "task.read",
    "task.create",
    "task.assign",
    "task.update",
    "document.read",
    "document.upload",
  ],

  EMPLOYEE: [
    "employee.read",
    "attendance.read",
    "leave.read",
    "leave.request",
    "project.read",
    "task.read",
    "task.update",
    "document.read",
  ],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Missing required permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** Throws ForbiddenError if the role lacks the permission. Intended to be
 * called from Express middleware after the JWT has been verified and the
 * role resolved from server-side session state - never from a client-sent
 * role field. */
export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(permission);
  }
}
