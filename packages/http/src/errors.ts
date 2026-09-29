import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { apiError } from "@nexora/types";
import type { Logger } from "@nexora/logger";

/**
 * Base domain error every service should throw instead of a plain Error,
 * so the centralized handler below can map it to the consistent
 * `{ success, error }` envelope (build spec section 25) without each
 * service reinventing this.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, "NOT_FOUND", `${resource} was not found.`);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required.") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(permission?: string) {
    super(
      403,
      "FORBIDDEN",
      permission
        ? `Missing required permission: ${permission}`
        : "You do not have permission to do this.",
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(409, "CONFLICT", message, details);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(apiError("NOT_FOUND", `No route matches ${req.method} ${req.path}`));
}

/** Bind a service's own logger once: `app.use(createErrorHandler(logger))`. */
export function createErrorHandler(logger: Logger) {
  return function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    const requestLogger = logger.child({
      requestId: req.requestId,
      method: req.method,
      route: req.path,
      durationMs: Date.now() - req.startTime,
    });

    if (err instanceof ZodError) {
      requestLogger.warn("request validation failed", { issues: err.issues });
      res.status(400).json(
        apiError("VALIDATION_ERROR", "The request did not pass validation.", {
          issues: err.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        }),
      );
      return;
    }

    if (err instanceof AppError) {
      const level = err.statusCode >= 500 ? "error" : "warn";
      requestLogger[level]("request failed", { code: err.code, statusCode: err.statusCode });
      res.status(err.statusCode).json(apiError(err.code, err.message, err.details));
      return;
    }

    requestLogger.error("unhandled error", {
      error: err instanceof Error ? err.stack : String(err),
    });
    res
      .status(500)
      .json(apiError("INTERNAL_SERVER_ERROR", "Something went wrong. Please try again."));
  };
}
