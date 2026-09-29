import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, permissionsForRole, type TokenConfig } from "@nexora/auth";
import { isRole, type AuthenticatedContext } from "@nexora/types";
import { UnauthorizedError } from "./errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Trusted identity resolved from the verified JWT. Every service
       * derives organizationId / userId / role from here, never from the
       * request body or query string (build spec section 27). */
      auth?: AuthenticatedContext;
    }
  }
}

export function authenticate(tokenConfig: Pick<TokenConfig, "accessTokenSecret">) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      next(new UnauthorizedError("Missing or malformed Authorization header."));
      return;
    }

    const token = header.slice("Bearer ".length);

    try {
      const claims = verifyAccessToken(token, tokenConfig);
      req.auth = {
        userId: claims.sub,
        organizationId: claims.organizationId,
        role: claims.role,
        permissions: [...permissionsForRole(claims.role)],
        sessionId: claims.sessionId,
      };
      const url = process.env.AUTH_SERVICE_INTERNAL_URL;
      if (!url) {
        if (process.env.NODE_ENV === "production") {
          next(new UnauthorizedError("Session verification is unavailable."));
          return;
        }
        next();
        return;
      }
      void fetch(`${url}/internal/sessions/introspect`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": process.env.INTERNAL_SERVICE_SECRET ?? "",
        },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(5000),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Session is not active");
          const result = (await response.json()) as { data: { role: string } };
          if (!isRole(result.data.role)) throw new Error("Invalid role");
          req.auth = {
            userId: claims.sub,
            organizationId: claims.organizationId,
            sessionId: claims.sessionId,
            role: result.data.role,
            permissions: [...permissionsForRole(result.data.role)],
          };
          next();
        })
        .catch(() =>
          next(new UnauthorizedError("Session is no longer active. Please sign in again.")),
        );
    } catch {
      next(new UnauthorizedError("Access token is invalid or has expired."));
    }
  };
}
