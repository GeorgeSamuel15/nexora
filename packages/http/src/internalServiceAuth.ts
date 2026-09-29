import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "./errors.js";

/**
 * Guards internal-only routes (e.g. POST /internal/organizations/bootstrap)
 * that other services call directly, never through the public gateway.
 * Deliberately separate from `authenticate` (user JWTs) - internal calls
 * aren't acting on behalf of a logged-in user and shouldn't need one.
 */
export function internalServiceAuth(sharedSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const provided = req.header("x-internal-secret");
    if (
      !provided ||
      !timingSafeEqual(
        createHash("sha256").update(provided).digest(),
        createHash("sha256").update(sharedSecret).digest(),
      )
    ) {
      next(new UnauthorizedError("Missing or invalid internal service credentials."));
      return;
    }
    next();
  };
}
