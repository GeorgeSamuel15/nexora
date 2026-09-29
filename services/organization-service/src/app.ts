import { branchRouter } from "./routes/branch.routes.js";
import { actionMail, enqueueMail } from "@nexora/mail";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import type { PrismaClient } from "../generated/client/index.js";
import type { TokenConfig } from "@nexora/auth";
import { apiSuccess } from "@nexora/types";
import { requestId, notFoundHandler, createErrorHandler } from "@nexora/http";
import { createNoopEventPublisher, type EventPublisher } from "@nexora/events";
import type { AuditClient } from "@nexora/audit-client";
import { createOrganizationService } from "./services/organization.service.js";
import { createStructureService } from "./services/structure.service.js";
import { createMembershipService } from "./services/membership.service.js";
import { createInvitationService } from "./services/invitation.service.js";
import { createInternalRouter } from "./routes/internal.routes.js";
import { createOrganizationRouter } from "./routes/organization.routes.js";
import { createStructureRouter } from "./routes/structure.routes.js";
import { createMembershipRouter } from "./routes/membership.routes.js";
import { createInvitationRouter } from "./routes/invitation.routes.js";
import { logger } from "./logger.js";

export interface AppDeps {
  prisma: PrismaClient;
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">;
  internalServiceSecret: string;
  corsOrigin: string;
  eventPublisher?: EventPublisher;
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
    res.status(dbHealthy ? 200 : 503).json(
      apiSuccess({
        service: "organization-service",
        healthy: dbHealthy,
        dependencies: { database: dbHealthy },
      }),
    );
  });

  const organizationService = createOrganizationService({ prisma: deps.prisma });
  const structureService = createStructureService({ prisma: deps.prisma });
  const membershipService = createMembershipService({
    prisma: deps.prisma,
    auditClient: deps.auditClient,
  });
  const invitationService = createInvitationService({
    prisma: deps.prisma,
    eventPublisher: deps.eventPublisher ?? createNoopEventPublisher(logger),
    onInvitationTokenIssued: async (rawToken, email) => {
      await enqueueMail(
        actionMail(email, "Join your team on Nexora", "/accept-invitation", rawToken),
      );
    },
  });

  app.use(
    "/internal",
    createInternalRouter(organizationService, invitationService, deps.internalServiceSecret),
  );
  app.use("/organizations", createOrganizationRouter(organizationService, deps.tokenConfig));
  app.use("/", createStructureRouter(structureService, deps.tokenConfig));
  app.use("/memberships", createMembershipRouter(membershipService, deps.tokenConfig));
  app.use("/invitations", createInvitationRouter(invitationService, deps.tokenConfig));

  app.use("/branches", branchRouter(deps.prisma, deps.tokenConfig));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
