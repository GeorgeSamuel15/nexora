import type { NextFunction, Request, Response } from "express";
import type { Redis } from "ioredis";
import { apiError } from "@nexora/types";

export interface RateLimitOptions {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
  keyFor?: (req: Request) => string;
}

/** Fixed-window counter in Redis - enough to stop brute force / abuse on a
 * specific endpoint without adding token-bucket complexity. */
export function rateLimit(redis: Redis, options: RateLimitOptions) {
  const keyFor = options.keyFor ?? ((req: Request) => req.ip ?? "unknown");

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bucketKey = `${options.keyPrefix}:${keyFor(req)}`;

    try {
      const count = await redis.incr(bucketKey);
      if (count === 1) {
        await redis.expire(bucketKey, options.windowSeconds);
      }

      if (count > options.limit) {
        const ttl = await redis.ttl(bucketKey);
        res.setHeader("Retry-After", String(Math.max(ttl, 1)));
        res
          .status(429)
          .json(apiError("RATE_LIMITED", "Too many requests. Please try again shortly."));
        return;
      }

      next();
    } catch {
      // Fail open on Redis hiccups - rate limiting is defense in depth,
      // not the only line of defense (e.g. auth-service's account lockout
      // is tracked in Postgres independently of this).
      next();
    }
  };
}
