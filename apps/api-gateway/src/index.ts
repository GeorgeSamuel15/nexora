import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt: number) => Math.min(attempt * 200, 5000),
});
redis.on("error", (err: Error) => {
  logger.warn("redis connection error", { error: err.message });
});

const app = createApp({
  redis,
  tokenConfig: { accessTokenSecret: env.JWT_SECRET },
  corsOrigin: env.CORS_ORIGIN,
  services: {
    authServiceUrl: env.AUTH_SERVICE_URL,
    organizationServiceUrl: env.ORGANIZATION_SERVICE_URL,
    userServiceUrl: env.USER_SERVICE_URL,
    hrServiceUrl: env.HR_SERVICE_URL,
    projectServiceUrl: env.PROJECT_SERVICE_URL,
    crmServiceUrl: env.CRM_SERVICE_URL,
    financeServiceUrl: env.FINANCE_SERVICE_URL,
    documentServiceUrl: env.DOCUMENT_SERVICE_URL,
    notificationServiceUrl: env.NOTIFICATION_SERVICE_URL,
    analyticsServiceUrl: env.ANALYTICS_SERVICE_URL,
    auditServiceUrl: env.AUDIT_SERVICE_URL,
  },
});

const server = app.listen(env.API_GATEWAY_PORT, () => {
  logger.info(`api-gateway listening on port ${env.API_GATEWAY_PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down gracefully`);
  server.close(() => {
    redis.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
