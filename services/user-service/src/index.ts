import { env } from "./env.js";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { createHttpAuditClient } from "@nexora/audit-client";

const app = createApp({
  prisma: db,
  tokenConfig: { accessTokenSecret: env.JWT_SECRET },
  internalServiceSecret: env.INTERNAL_SERVICE_SECRET,
  corsOrigin: env.CORS_ORIGIN,
  auditClient: createHttpAuditClient(
    {
      auditServiceUrl: env.AUDIT_SERVICE_INTERNAL_URL,
      internalSecret: env.INTERNAL_SERVICE_SECRET,
    },
    logger,
  ),
});

const server = app.listen(env.USER_SERVICE_PORT, () => {
  logger.info(`user-service listening on port ${env.USER_SERVICE_PORT}`);
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
