import { env } from "./env.js";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { createNoopEventPublisher, createResilientEventPublisher } from "@nexora/events";
import { createHttpAuditClient } from "@nexora/audit-client";

const eventPublisher = await createResilientEventPublisher(
  { url: env.RABBITMQ_URL },
  logger,
  createNoopEventPublisher(logger),
);

const app = createApp({
  prisma: db,
  // organization-service only ever VERIFIES access tokens issued by
  // auth-service - it never signs anything, so it only needs the one
  // secret (verifyAccessToken's signature was narrowed in @nexora/auth
  // specifically so services like this one don't need to invent unused
  // refresh-token config just to satisfy a wider type).
  tokenConfig: { accessTokenSecret: env.JWT_SECRET },
  internalServiceSecret: env.INTERNAL_SERVICE_SECRET,
  corsOrigin: env.CORS_ORIGIN,
  eventPublisher,
  auditClient: createHttpAuditClient(
    {
      auditServiceUrl: env.AUDIT_SERVICE_INTERNAL_URL,
      internalSecret: env.INTERNAL_SERVICE_SECRET,
    },
    logger,
  ),
});

const server = app.listen(env.ORGANIZATION_SERVICE_PORT, () => {
  logger.info(`organization-service listening on port ${env.ORGANIZATION_SERVICE_PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down gracefully`);
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
