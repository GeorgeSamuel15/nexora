import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { PrismaClient } from "../generated/client/index.js";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import { createNoopEventPublisher, type EventPublisher } from "@nexora/events";
import { createProjectService } from "./services/project.service.js";
import { createTaskService } from "./services/task.service.js";
import { createProjectRouter } from "./routes/project.routes.js";
import { createTaskRouter } from "./routes/task.routes.js";
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
          service: "project-service",
          healthy: dbHealthy,
          dependencies: { database: dbHealthy },
        }),
      );
  });

  const projectService = createProjectService({ prisma: deps.prisma });
  const taskService = createTaskService({
    prisma: deps.prisma,
    projectService,
    eventPublisher: deps.eventPublisher ?? createNoopEventPublisher(logger),
  });

  app.use("/projects", createProjectRouter(projectService, deps.tokenConfig));
  app.use("/tasks", createTaskRouter(taskService, deps.tokenConfig));
  app.use("/internal", createInternalRouter(projectService, deps.internalServiceSecret));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
