import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { PrismaClient } from "../generated/client/index.js";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import { createNoopEventPublisher, type EventPublisher } from "@nexora/events";
import { createClientService } from "./services/client.service.js";
import { createLeadService } from "./services/lead.service.js";
import { createPipelineService } from "./services/pipeline.service.js";
import { createDealService } from "./services/deal.service.js";
import { createLeadRouter } from "./routes/lead.routes.js";
import { createClientRouter } from "./routes/client.routes.js";
import { createPipelineRouter } from "./routes/pipeline.routes.js";
import { createDealRouter } from "./routes/deal.routes.js";
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
          service: "crm-service",
          healthy: dbHealthy,
          dependencies: { database: dbHealthy },
        }),
      );
  });

  const clientService = createClientService({ prisma: deps.prisma });
  const leadService = createLeadService({ prisma: deps.prisma, clientService });
  const pipelineService = createPipelineService({ prisma: deps.prisma });
  const dealService = createDealService({
    prisma: deps.prisma,
    clientService,
    pipelineService,
    eventPublisher: deps.eventPublisher ?? createNoopEventPublisher(logger),
  });

  app.use("/leads", createLeadRouter(leadService, deps.tokenConfig));
  app.use("/clients", createClientRouter(clientService, deps.tokenConfig));
  app.use("/pipelines", createPipelineRouter(pipelineService, deps.tokenConfig));
  app.use("/deals", createDealRouter(dealService, deps.tokenConfig));
  app.use("/internal", createInternalRouter(dealService, deps.internalServiceSecret));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
