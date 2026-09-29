import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import type { StatsClients } from "./clients/statsClients.js";
import { createDashboardService } from "./services/dashboard.service.js";
import { createDashboardRouter } from "./routes/dashboard.routes.js";
import { logger } from "./logger.js";

export interface AppDeps {
  statsClients: StatsClients;
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">;
  corsOrigin: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const errorHandler = createErrorHandler(logger);

  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestId);

  // No database here - this service holds no data of its own, only
  // aggregates other services' internal stats endpoints at request time.
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json(apiSuccess({ service: "analytics-service", healthy: true }));
  });

  const dashboardService = createDashboardService({ statsClients: deps.statsClients });
  app.use("/dashboard", createDashboardRouter(dashboardService, deps.tokenConfig));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
