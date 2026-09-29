import type { NextFunction, Request, Response } from "express";
import { hasPermission } from "@nexora/auth";
import type { Permission } from "@nexora/types";
import { ForbiddenError, UnauthorizedError } from "./errors.js";

/**
 * Must run after `authenticate` (needs `req.auth` populated). Checks the
 * permission against the role embedded in the verified JWT - never a
 * client-supplied field - per build spec section 27.
 *
 * Usage: router.patch("/:id", authenticate(cfg), requirePermission("employee.update"), handler)
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }
    if (!hasPermission(req.auth.role, permission)) {
      next(new ForbiddenError(permission));
      return;
    }
    next();
  };
}
