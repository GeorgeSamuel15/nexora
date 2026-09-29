import { createHash } from "node:crypto";
import amqp, { type ConfirmChannel, type ConsumeMessage } from "amqplib";
import type { NexoraEvent } from "@nexora/events";
import { mapEventToNotification } from "./eventMapper.js";
import type { NotificationService } from "./services/notification.service.js";
import { logger } from "./logger.js";

const EXCHANGE = "nexora.events";
const QUEUE = "notification-service.events";
// Catch-all binding - notification-service decides per-event (via
// mapEventToNotification) whether it's notification-worthy, rather than
// maintaining a second list of routing-key patterns that has to be kept
// in sync with the first.
const BINDING_PATTERN = "nexora.#";

export interface NotificationConsumer {
  close(): Promise<void>;
}

export async function startNotificationConsumer(
  rabbitMqUrl: string,
  notificationService: NotificationService,
  onDisconnect?: () => void,
): Promise<NotificationConsumer> {
  const connection = await amqp.connect(rabbitMqUrl);
  const channel: ConfirmChannel = await connection.createConfirmChannel();
  await channel.prefetch(10);
  await channel.assertQueue(`${QUEUE}.dead`, { durable: true });
  await channel.assertQueue(`${QUEUE}.retry`, {
    durable: true,
    arguments: {
      "x-message-ttl": 10000,
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": QUEUE,
    },
  });

  connection.on("error", () => logger.warn("Notification broker connection failed"));
  connection.on("close", () => onDisconnect?.());
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, BINDING_PATTERN);

  await channel.consume(QUEUE, (msg: ConsumeMessage | null) => {
    if (!msg) return;
    handleMessage(msg, channel, notificationService).catch((err) => {
      logger.error("unhandled error processing event message", {
        error: err instanceof Error ? err.message : String(err),
      });
      const attempts = Number(msg.properties.headers?.["x-nexora-attempt"] ?? 0);
      const destination = attempts >= 5 ? `${QUEUE}.dead` : `${QUEUE}.retry`;
      channel.sendToQueue(
        destination,
        msg.content,
        {
          persistent: true,
          contentType: "application/json",
          headers: { ...msg.properties.headers, "x-nexora-attempt": attempts + 1 },
        },
        (error) => {
          if (error) channel.nack(msg, false, true);
          else channel.ack(msg);
        },
      );
    });
  });

  logger.info("notification consumer listening", {
    exchange: EXCHANGE,
    queue: QUEUE,
    pattern: BINDING_PATTERN,
  });

  return {
    async close() {
      await channel.close();
      await connection.close();
    },
  };
}

async function handleMessage(
  msg: ConsumeMessage,
  channel: ConfirmChannel,
  notificationService: NotificationService,
): Promise<void> {
  let event: NexoraEvent;
  try {
    event = JSON.parse(msg.content.toString("utf8")) as NexoraEvent;
  } catch {
    throw new Error("Invalid event JSON");
  }

  if (
    !event ||
    typeof event.type !== "string" ||
    typeof event.organizationId !== "string" ||
    !event.payload ||
    typeof event.payload !== "object"
  )
    throw new Error("Invalid event envelope");
  const draft = mapEventToNotification(event);
  if (!draft) {
    channel.ack(msg); // not notification-worthy - still acknowledge so it isn't redelivered forever
    return;
  }

  await notificationService.createNotification(
    event.organizationId,
    draft,
    createHash("sha256").update(msg.content).digest("hex"),
  );
  channel.ack(msg);
}
