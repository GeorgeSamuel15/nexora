import { mailQueue } from "./mail.js";
import { env } from "./env.js";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { createNotificationService } from "./services/notification.service.js";
import { startNotificationConsumer, type NotificationConsumer } from "./consumer.js";

const app = createApp({
  prisma: db,
  internalServiceSecret: env.INTERNAL_SERVICE_SECRET,
  tokenConfig: { accessTokenSecret: env.JWT_SECRET },
  corsOrigin: env.CORS_ORIGIN,
});

const queue = mailQueue(db, env.INTERNAL_SERVICE_SECRET);
const mailTimer = setInterval(() => {
  void queue.tick().catch(() => logger.error("Email queue processing failed"));
}, 5000);
mailTimer.unref();

const server = app.listen(env.NOTIFICATION_SERVICE_PORT, () => {
  logger.info(`notification-service listening on port ${env.NOTIFICATION_SERVICE_PORT}`);
});

let consumer: NotificationConsumer | undefined;
const notificationService = createNotificationService({ prisma: db });

let stopping = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
function reconnect() {
  if (stopping || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connectConsumer();
  }, 5000);
  reconnectTimer.unref();
}
async function connectConsumer() {
  try {
    consumer = await startNotificationConsumer(env.RABBITMQ_URL, notificationService, reconnect);
  } catch {
    logger.warn("Notification broker unavailable; reconnect scheduled");
    reconnect();
  }
}
void connectConsumer();

async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down gracefully`);
  stopping = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  clearInterval(mailTimer);
  server.close(async () => {
    await consumer?.close().catch(() => undefined);
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
