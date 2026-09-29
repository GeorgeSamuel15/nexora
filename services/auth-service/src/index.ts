import { Redis } from "ioredis";
import { env } from "./env.js";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import * as organizationServiceClient from "./clients/organizationServiceClient.js";
import { createHttpAuditClient } from "@nexora/audit-client";

const redis = new Redis(env.REDIS_URL, {
  // Don't crash the whole process if Redis is briefly unavailable -
  // rateLimit.ts already fails open, and this keeps retrying in the
  // background instead of throwing on every command.
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt: number) => Math.min(attempt * 200, 5000),
});

redis.on("error", (err: Error) => {
  logger.warn("redis connection error", { error: err.message });
});

const app = createApp({
  prisma: db,
  internalServiceSecret: env.INTERNAL_SERVICE_SECRET,
  redis,
  organizationClient: organizationServiceClient,
  tokenConfig: {
    accessTokenSecret: env.JWT_SECRET,
    refreshTokenSecret: env.JWT_REFRESH_SECRET,
    accessTokenTtl: env.JWT_ACCESS_TOKEN_TTL,
    refreshTokenTtl: env.JWT_REFRESH_TOKEN_TTL,
  },
  corsOrigin: env.CORS_ORIGIN,
  auditClient: createHttpAuditClient(
    {
      auditServiceUrl: env.AUDIT_SERVICE_INTERNAL_URL,
      internalSecret: env.INTERNAL_SERVICE_SECRET,
    },
    logger,
  ),
});

const server = app.listen(env.AUTH_SERVICE_PORT, () => {
  logger.info(`auth-service listening on port ${env.AUTH_SERVICE_PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down gracefully`);
  server.close(async () => {
    await db.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
