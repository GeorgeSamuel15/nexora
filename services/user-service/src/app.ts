import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { PrismaClient } from "../generated/client/index.js";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import { createEmployeeService } from "./services/employee.service.js";
import { createEmployeeRouter } from "./routes/employee.routes.js";
import { createInternalRouter } from "./routes/internal.routes.js";
import type { AuditClient } from "@nexora/audit-client";
import { logger } from "./logger.js";

export interface AppDeps {
  prisma: PrismaClient;
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">;
  corsOrigin: string;
  internalServiceSecret: string;
  auditClient: AuditClient;
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
          service: "user-service",
          healthy: dbHealthy,
          dependencies: { database: dbHealthy },
        }),
      );
  });

  const employeeService = createEmployeeService({
    prisma: deps.prisma,
    auditClient: deps.auditClient,
  });
  app.use("/employees", createEmployeeRouter(employeeService, deps.tokenConfig));
  app.use("/internal", createInternalRouter(employeeService, deps.internalServiceSecret));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
