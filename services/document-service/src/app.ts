import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { PrismaClient } from "../generated/client/index.js";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import { createNoopEventPublisher, type EventPublisher } from "@nexora/events";
import type { AuditClient } from "@nexora/audit-client";
import type { StorageDriver } from "./storage/index.js";
import { createDocumentService } from "./services/document.service.js";
import { createDocumentRouter } from "./routes/document.routes.js";
import { logger } from "./logger.js";

export interface AppDeps {
  prisma: PrismaClient;
  storage: StorageDriver;
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">;
  corsOrigin: string;
  maxUploadSizeBytes: number;
  eventPublisher?: EventPublisher;
  auditClient: AuditClient;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const errorHandler = createErrorHandler(logger);

  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin, credentials: true }));
  // Note: express.json() is applied per-router below (not globally) and
  // BEFORE multer's upload.single() on the POST route - that's safe:
  // body-parser checks the Content-Type header and only consumes the
  // stream for application/json requests, passing multipart/form-data
  // straight through to multer untouched.
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
          service: "document-service",
          healthy: dbHealthy,
          dependencies: { database: dbHealthy },
        }),
      );
  });

  const documentService = createDocumentService({
    prisma: deps.prisma,
    storage: deps.storage,
    eventPublisher: deps.eventPublisher ?? createNoopEventPublisher(logger),
    auditClient: deps.auditClient,
  });
  app.use(
    "/documents",
    express.json({ limit: "10kb" }), // small: only ever needed for the non-multipart routes (rename, etc.)
    createDocumentRouter(documentService, deps.tokenConfig, {
      maxUploadSizeBytes: deps.maxUploadSizeBytes,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
