import { env } from "./env.js";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { createStorageDriver } from "./storage/index.js";
import { createNoopEventPublisher, createResilientEventPublisher } from "@nexora/events";
import { createHttpAuditClient } from "@nexora/audit-client";

const storage = createStorageDriver({
  driver: env.DOCUMENT_STORAGE_DRIVER,
  localPath: env.DOCUMENT_STORAGE_LOCAL_PATH,
});

const eventPublisher = await createResilientEventPublisher(
  { url: env.RABBITMQ_URL },
  logger,
  createNoopEventPublisher(logger),
);

const app = createApp({
  prisma: db,
  storage,
  tokenConfig: { accessTokenSecret: env.JWT_SECRET },
  corsOrigin: env.CORS_ORIGIN,
  maxUploadSizeBytes: env.DOCUMENT_MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  eventPublisher,
  auditClient: createHttpAuditClient(
    {
      auditServiceUrl: env.AUDIT_SERVICE_INTERNAL_URL,
      internalSecret: env.INTERNAL_SERVICE_SECRET,
    },
    logger,
  ),
});

const server = app.listen(env.DOCUMENT_SERVICE_PORT, () => {
  logger.info(`document-service listening on port ${env.DOCUMENT_SERVICE_PORT}`);
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
