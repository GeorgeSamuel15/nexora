import { authenticate, UnauthorizedError } from "@nexora/http";
import { asyncHandler } from "@nexora/utils";
import { z } from "zod";
import { mailQueue } from "./mail.js";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { PrismaClient } from "../generated/client/index.js";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import { createNotificationService } from "./services/notification.service.js";
import { createNotificationRouter } from "./routes/notification.routes.js";
import { logger } from "./logger.js";

export interface AppDeps {
  prisma: PrismaClient;
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">;
  corsOrigin: string;
  internalServiceSecret?: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const errorHandler = createErrorHandler(logger);

  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestId);

  app.get("/health", async (_req: Request, res: Response) => {
    let dbHealthy = true;
    try {
      await deps.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbHealthy = false;
    }
    res.status(dbHealthy ? 200 : 503).json(
      apiSuccess({
        service: "notification-service",
        healthy: dbHealthy,
        dependencies: { database: dbHealthy },
      }),
    );
  });

  if (deps.internalServiceSecret)
    app.use("/internal", mailQueue(deps.prisma, deps.internalServiceSecret).router);

  const notificationService = createNotificationService({ prisma: deps.prisma });
  app.use("/notifications", createNotificationRouter(notificationService, deps.tokenConfig));

  app.get(
    "/notifications/preferences/me",
    authenticate(deps.tokenConfig),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const { organizationId, userId } = req.auth;
      const preference = await deps.prisma.notificationPreference.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      });
      res.json(apiSuccess({ inApp: preference?.inApp ?? true }));
    }),
  );
  app.put(
    "/notifications/preferences/me",
    authenticate(deps.tokenConfig),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const { organizationId, userId } = req.auth;
      const input = z.object({ inApp: z.boolean() }).parse(req.body);
      res.json(
        apiSuccess(
          await deps.prisma.notificationPreference.upsert({
            where: { organizationId_userId: { organizationId, userId } },
            create: { organizationId, userId, ...input },
            update: input,
          }),
        ),
      );
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
