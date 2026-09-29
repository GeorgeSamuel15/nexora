import amqp, { type Channel, type ConsumeMessage } from "amqplib";
import type { NexoraEvent } from "@nexora/events";
import { mapEventToAuditEntry } from "./eventMapper.js";
import type { AuditService } from "./services/audit.service.js";
import { logger } from "./logger.js";

const EXCHANGE = "nexora.events";
// A DIFFERENT queue name than notification-service's - each service gets
// its own durable queue bound to the same exchange, so both receive
// every matching message independently (fan-out, not competing
// consumers). Losing notification-service doesn't affect audit-service's
// queue or vice versa.
const QUEUE = "audit-service.events";
const BINDING_PATTERN = "nexora.#";

export interface AuditConsumer {
  close(): Promise<void>;
}

export async function startAuditConsumer(
  rabbitMqUrl: string,
  auditService: AuditService,
): Promise<AuditConsumer> {
  const connection = await amqp.connect(rabbitMqUrl);
  const channel: Channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, BINDING_PATTERN);

  await channel.consume(QUEUE, (msg: ConsumeMessage | null) => {
    if (!msg) return;
    handleMessage(msg, channel, auditService).catch((err) => {
      logger.error("unhandled error processing event message", {
        error: err instanceof Error ? err.message : String(err),
      });
      channel.nack(msg, false, false);
    });
  });

  logger.info("audit consumer listening", {
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
  channel: Channel,
  auditService: AuditService,
): Promise<void> {
  let event: NexoraEvent;
  try {
    event = JSON.parse(msg.content.toString("utf8")) as NexoraEvent;
  } catch {
    logger.warn("dropping malformed event message (not valid JSON)");
    channel.nack(msg, false, false);
    return;
  }

  const entry = mapEventToAuditEntry(event);
  await auditService.recordEntry(entry);
  channel.ack(msg);
}
