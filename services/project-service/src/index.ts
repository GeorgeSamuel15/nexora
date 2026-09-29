import { env } from "./env.js";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { createNoopEventPublisher, createResilientEventPublisher } from "@nexora/events";

const eventPublisher = await createResilientEventPublisher(
  { url: env.RABBITMQ_URL },
  logger,
  createNoopEventPublisher(logger),
);

const app = createApp({
  prisma: db,
  tokenConfig: { accessTokenSecret: env.JWT_SECRET },
  corsOrigin: env.CORS_ORIGIN,
  eventPublisher,
  internalServiceSecret: env.INTERNAL_SERVICE_SECRET,
});

const server = app.listen(env.PROJECT_SERVICE_PORT, () => {
  logger.info(`project-service listening on port ${env.PROJECT_SERVICE_PORT}`);
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
