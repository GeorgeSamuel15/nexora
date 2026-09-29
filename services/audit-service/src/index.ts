import { env } from "./env.js";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { createAuditService } from "./services/audit.service.js";
import { startAuditConsumer, type AuditConsumer } from "./consumer.js";

const app = createApp({
  prisma: db,
  tokenConfig: { accessTokenSecret: env.JWT_SECRET },
  corsOrigin: env.CORS_ORIGIN,
  internalServiceSecret: env.INTERNAL_SERVICE_SECRET,
});

const server = app.listen(env.AUDIT_SERVICE_PORT, () => {
  logger.info(`audit-service listening on port ${env.AUDIT_SERVICE_PORT}`);
});

let consumer: AuditConsumer | undefined;
const auditService = createAuditService({ prisma: db });

startAuditConsumer(env.RABBITMQ_URL, auditService)
  .then((c) => {
    consumer = c;
  })
  .catch((err) => {
    logger.warn(
      "could not start RabbitMQ consumer - event-sourced audit entries will not be recorded until next restart",
      {
        error: err instanceof Error ? err.message : String(err),
      },
    );
  });

async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down gracefully`);
  server.close(async () => {
    await consumer?.close().catch(() => undefined);
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
