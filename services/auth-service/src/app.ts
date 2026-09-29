import { verifyAccessToken } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { internalServiceAuth, UnauthorizedError } from "@nexora/http";
import { actionMail, enqueueMail, type Mail } from "@nexora/mail";
import { protectBrowserOrigin } from "./browserSession.js";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { PrismaClient } from "../generated/client/index.js";
import type { Redis } from "ioredis";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { createAuthService, type OrganizationClient } from "./services/auth.service.js";
import { createAuthController } from "./controllers/auth.controller.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import type { AuditClient } from "@nexora/audit-client";
import { logger } from "./logger.js";

export interface AppDeps {
  prisma: PrismaClient;
  redis: Redis;
  organizationClient: OrganizationClient;
  tokenConfig: TokenConfig;
  corsOrigin: string;
  auditClient: AuditClient;
  internalServiceSecret?: string;
  deliverMail?: (mail: Mail) => Promise<void>;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const errorHandler = createErrorHandler(logger);

  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestId);
  app.use("/auth", (req, _res, next) => {
    try {
      if (req.method !== "GET") protectBrowserOrigin(req, deps.corsOrigin);
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get("/health", async (_req: Request, res: Response) => {
    let dbHealthy = true;
    try {
      await deps.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbHealthy = false;
    }

    const redisHealthy = deps.redis.status === "ready";
    const healthy = dbHealthy && redisHealthy;

    res.status(healthy ? 200 : 503).json(
      apiSuccess({
        service: "auth-service",
        healthy,
        dependencies: { database: dbHealthy, redis: redisHealthy },
      }),
    );
  });

  const authService = createAuthService({
    prisma: deps.prisma,
    organizationClient: deps.organizationClient,
    tokenConfig: deps.tokenConfig,
    auditClient: deps.auditClient,
    onPasswordResetTokenIssued: async (rawToken, userId) => {
      const user = await deps.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new UnauthorizedError();
      await (deps.deliverMail ?? enqueueMail)(
        actionMail(user.email, "Reset your Nexora password", "/reset-password", rawToken),
      );
    },
    onEmailVerificationTokenIssued: async (rawToken, userId) => {
      const user = await deps.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new UnauthorizedError();
      await (deps.deliverMail ?? enqueueMail)(
        actionMail(user.email, "Verify your Nexora email", "/verify-email", rawToken),
      );
    },
  });
  const authController = createAuthController(authService);
  const authRouter = createAuthRouter(authController, {
    redis: deps.redis,
    tokenConfig: deps.tokenConfig,
  });

  if (deps.internalServiceSecret)
    app.post(
      "/internal/sessions/introspect",
      internalServiceAuth(deps.internalServiceSecret),
      asyncHandler(async (req: Request, res: Response) => {
        const claims = verifyAccessToken(req.body.token, deps.tokenConfig);
        const session = await deps.prisma.session.findUnique({
          where: { id: claims.sessionId },
          include: { user: true },
        });
        if (
          !session ||
          session.userId !== claims.sub ||
          session.organizationId !== claims.organizationId ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          !session.user.isActive
        )
          throw new UnauthorizedError();
        const membership = await deps.organizationClient.lookupActiveMembership(claims.sub);
        if (membership.organizationId !== claims.organizationId) throw new UnauthorizedError();
        res.json(apiSuccess({ role: membership.role }));
      }),
    );
  app.use("/auth", authRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
