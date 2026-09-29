import { performanceRouter } from "./routes/performance.routes.js";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { PrismaClient } from "../generated/client/index.js";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import { createNoopEventPublisher, type EventPublisher } from "@nexora/events";
import { createAttendanceService } from "./services/attendance.service.js";
import { createLeaveService } from "./services/leave.service.js";
import { createAttendanceRouter } from "./routes/attendance.routes.js";
import { createLeaveRouter } from "./routes/leave.routes.js";
import { createInternalRouter } from "./routes/internal.routes.js";
import { logger } from "./logger.js";

export interface AppDeps {
  prisma: PrismaClient;
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">;
  corsOrigin: string;
  eventPublisher?: EventPublisher;
  internalServiceSecret: string;
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
    res
      .status(dbHealthy ? 200 : 503)
      .json(
        apiSuccess({
          service: "hr-service",
          healthy: dbHealthy,
          dependencies: { database: dbHealthy },
        }),
      );
  });

  const attendanceService = createAttendanceService({ prisma: deps.prisma });
  const leaveService = createLeaveService({
    prisma: deps.prisma,
    eventPublisher: deps.eventPublisher ?? createNoopEventPublisher(logger),
  });

  app.use("/attendance", createAttendanceRouter(attendanceService, deps.tokenConfig));
  app.use("/", createLeaveRouter(leaveService, deps.tokenConfig));
  app.use("/internal", createInternalRouter(leaveService, deps.internalServiceSecret));

  app.use("/performance-reviews", performanceRouter(deps.prisma, deps.tokenConfig));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
