import type { NextFunction, Request, Response } from "express";
import { z, type ZodTypeAny } from "zod";

/** All public entity identifiers are UUIDs; validate before database access. */
export function routeId(req: Request, name = "id"): string {
  return z.string().uuid().parse(req.params[name]);
}

export function validateBody<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body) as z.infer<TSchema>;
      next();
    } catch (err) {
      next(err); // ZodError - handled centrally by errors.ts's createErrorHandler
    }
  };
}

export function validateQuery<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Express's `req.query` is read-only in newer versions - stash the
      // parsed, typed result separately rather than reassigning it.
      (req as Request & { validatedQuery?: unknown }).validatedQuery = schema.parse(
        req.query,
      ) as z.infer<TSchema>;
      next();
    } catch (err) {
      next(err);
    }
  };
}
