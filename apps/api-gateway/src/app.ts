import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { Redis } from "ioredis";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import {
  authenticate,
  createErrorHandler,
  notFoundHandler,
  rateLimit,
  requestId,
} from "@nexora/http";
import {
  buildRoutes,
  healthTargets,
  PUBLIC_AUTH_PATHS,
  type BuildRoutesConfig,
} from "./routes/routeTable.js";
import { logger } from "./logger.js";

export interface AppDeps {
  redis: Redis;
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">;
  corsOrigin: string;
  services: BuildRoutesConfig;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const errorHandler = createErrorHandler(logger);
  const requireAuth = authenticate(deps.tokenConfig);

  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin, credentials: true }));
  app.use(requestId);

  // NOTE: no express.json() here, deliberately. The gateway proxies raw
  // request streams straight through - parsing the body would consume the
  // stream and break both JSON forwarding and document-service's
  // multipart uploads. The gateway never needs to read a body; only the
  // services do, and they parse it themselves.

  // Aggregated health: the gateway's own status plus every service it
  // fronts, so one call answers "is the platform up?"
  app.get("/health", async (_req: Request, res: Response) => {
    const targets = healthTargets(deps.services);
    const results = await Promise.all(
      targets.map(async (target) => {
        try {
          const response = await fetch(`${target.url}/health`, {
            signal: AbortSignal.timeout(3000),
          });
          return { name: target.name, healthy: response.ok };
        } catch {
          return { name: target.name, healthy: false };
        }
      }),
    );
    const allHealthy = results.every((r) => r.healthy);
    res.status(allHealthy ? 200 : 503).json(
      apiSuccess({
        service: "api-gateway",
        healthy: allHealthy,
        dependencies: Object.fromEntries(results.map((r) => [r.name, r.healthy])),
      }),
    );
  });

  // Global rate limit - a blunt backstop against abuse at the edge.
  // Endpoint-specific limits (e.g. auth-service's stricter per-IP login
  // limit) stay in the owning service where the context lives.
  app.use(
    "/api",
    rateLimit(deps.redis, { keyPrefix: "ratelimit:gateway", limit: 300, windowSeconds: 60 }),
  );

  /**
   * /api/auth is the one prefix with mixed public and protected paths -
   * you can't present a token to the endpoint that issues your first
   * one, but /api/auth/me still needs one. So auth is decided per-path
   * here rather than per-prefix.
   */
  const authGate = (req: Request, res: Response, next: NextFunction): void => {
    const subPath = req.path;
    const isPublic =
      req.method === "POST" && PUBLIC_AUTH_PATHS.some((p) => subPath === p || subPath === `${p}/`);
    if (isPublic) {
      next();
      return;
    }
    requireAuth(req, res, next);
  };

  for (const route of buildRoutes(deps.services)) {
    const middlewares = [];
    if (route.prefix === "/api/auth") {
      middlewares.push(authGate);
    } else if (route.requiresAuth) {
      middlewares.push(requireAuth);
    }

    middlewares.push(
      createProxyMiddleware({
        target: route.target,
        changeOrigin: true,
        // Express removes the mount path from req.url. Restore it from
        // originalUrl before removing only the public /api prefix.
        pathRewrite: (_path: string, req: Request) =>
          req.originalUrl.slice(route.stripPrefix.length),
        proxyTimeout: 15_000,
        timeout: 20_000,
        on: {
          proxyReq: (proxyReq, req: Request) => {
            // Propagate the request id so a single request is traceable
            // across the gateway and every service it touches.
            if (req.requestId) proxyReq.setHeader("x-request-id", req.requestId);
            for (const header of [
              "x-internal-secret",
              "x-user-id",
              "x-organization-id",
              "x-role",
              "x-permissions",
            ]) {
              proxyReq.removeHeader(header);
            }
          },
          error: (err: Error, req: Request, res: unknown) => {
            logger.error("proxy error", {
              requestId: req.requestId,
              route: route.prefix,
              error: err.message,
            });
            const response = res as Response;
            if (typeof response.status === "function" && !response.headersSent) {
              response.status(502).json({
                success: false,
                error: {
                  code: "UPSTREAM_UNAVAILABLE",
                  message: `${route.prefix} is temporarily unavailable.`,
                },
              });
            }
          },
        },
      }),
    );

    app.use(route.prefix, ...middlewares);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
