import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { PrismaClient } from "../generated/client/index.js";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import { createNoopEventPublisher, type EventPublisher } from "@nexora/events";
import { createInvoiceService } from "./services/invoice.service.js";
import { createPaymentService } from "./services/payment.service.js";
import { createExpenseService } from "./services/expense.service.js";
import { createReportingService } from "./services/reporting.service.js";
import { createInvoiceRouter } from "./routes/invoice.routes.js";
import { createPaymentRouter } from "./routes/payment.routes.js";
import { createExpenseRouter } from "./routes/expense.routes.js";
import { createReportingRouter } from "./routes/reporting.routes.js";
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
    res.status(dbHealthy ? 200 : 503).json(
      apiSuccess({
        service: "finance-service",
        healthy: dbHealthy,
        dependencies: { database: dbHealthy },
      }),
    );
  });

  const eventPublisher = deps.eventPublisher ?? createNoopEventPublisher(logger);
  const invoiceService = createInvoiceService({ prisma: deps.prisma, eventPublisher });
  const paymentService = createPaymentService({
    prisma: deps.prisma,
    invoiceService,
    eventPublisher,
  });
  const expenseService = createExpenseService({ prisma: deps.prisma });
  const reportingService = createReportingService({ prisma: deps.prisma });

  app.use("/invoices", createInvoiceRouter(invoiceService, paymentService, deps.tokenConfig));
  app.use("/payments", createPaymentRouter(paymentService, deps.tokenConfig));
  app.use("/expenses", createExpenseRouter(expenseService, deps.tokenConfig));
  app.use("/reports", createReportingRouter(reportingService, deps.tokenConfig));
  app.use("/internal", createInternalRouter(reportingService, deps.internalServiceSecret));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
