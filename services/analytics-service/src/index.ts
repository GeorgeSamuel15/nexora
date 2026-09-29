import { env } from "./env.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { createStatsClients } from "./clients/statsClients.js";

const statsClients = createStatsClients({
  internalSecret: env.INTERNAL_SERVICE_SECRET,
  userServiceUrl: env.USER_SERVICE_INTERNAL_URL,
  hrServiceUrl: env.HR_SERVICE_INTERNAL_URL,
  projectServiceUrl: env.PROJECT_SERVICE_INTERNAL_URL,
  crmServiceUrl: env.CRM_SERVICE_INTERNAL_URL,
  financeServiceUrl: env.FINANCE_SERVICE_INTERNAL_URL,
});

const app = createApp({
  statsClients,
  tokenConfig: { accessTokenSecret: env.JWT_SECRET },
  corsOrigin: env.CORS_ORIGIN,
});

const server = app.listen(env.ANALYTICS_SERVICE_PORT, () => {
  logger.info(`analytics-service listening on port ${env.ANALYTICS_SERVICE_PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down gracefully`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
