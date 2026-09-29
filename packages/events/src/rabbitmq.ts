import { mkdir, readdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import amqp from "amqplib";
import type { EventPublisher } from "./contracts.js";
import { routingKeyFor, type NexoraEvent } from "./contracts.js";

export interface RabbitMqPublisherConfig {
  url: string;
  /** Topic exchange every service publishes to and notification-service
   * (Phase 10) binds a queue against with a wildcard pattern. */
  exchange?: string;
}

export interface RabbitMqEventPublisher extends EventPublisher {
  close(): Promise<void>;
}

const DEFAULT_EXCHANGE = "nexora.events";

/**
 * Connects to RabbitMQ, asserts the shared topic exchange, and returns a
 * publisher that publishes each event as persistent JSON under its
 * routing key (see routingKeyFor in index.ts). Callers should treat
 * connection failure as non-fatal - see createResilientEventPublisher
 * below, which is what services actually use in practice.
 */
export async function createRabbitMqEventPublisher(
  config: RabbitMqPublisherConfig,
): Promise<RabbitMqEventPublisher> {
  const exchange = config.exchange ?? DEFAULT_EXCHANGE;
  const connection = await amqp.connect(config.url);
  const channel = await connection.createConfirmChannel();
  connection.on("error", () => {});
  channel.on("error", () => {});
  await channel.assertExchange(exchange, "topic", { durable: true });

  return {
    async publish(event: NexoraEvent) {
      const routingKey = routingKeyFor(event.type);
      const payload = Buffer.from(JSON.stringify(event));
      await new Promise<void>((resolve, reject) => {
        channel.publish(
          exchange,
          routingKey,
          payload,
          { contentType: "application/json", persistent: true },
          (error) => (error ? reject(error) : resolve()),
        );
      });
    },
    async close() {
      await channel.close();
      await connection.close();
    },
  };
}

interface MinimalLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

/** Durable local delivery spool. Keep EVENT_OUTBOX_PATH on a persistent volume.
 * Domain writes still need a transactional database outbox for crash atomicity;
 * this spool prevents broker outages from silently discarding queued events.
 */
export async function createResilientEventPublisher(
  config: RabbitMqPublisherConfig,
  logger: MinimalLogger,
  _fallback: EventPublisher,
): Promise<EventPublisher> {
  const directory = process.env.EVENT_OUTBOX_PATH ?? join(process.cwd(), "storage", "event-outbox");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let publisher: RabbitMqEventPublisher | undefined;
  let flushing = false;
  async function flush(): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      const files = (await readdir(directory))
        .filter((name) => name.endsWith(".json"))
        .sort()
        .slice(0, 100);
      if (!files.length) return;
      publisher ??= await createRabbitMqEventPublisher(config);
      for (const file of files) {
        const event = JSON.parse(await readFile(join(directory, file), "utf8")) as NexoraEvent;
        await publisher.publish(event);
        await unlink(join(directory, file));
      }
    } catch {
      await publisher?.close().catch(() => undefined);
      publisher = undefined;
      logger.warn("Event delivery delayed; queued events will be retried");
    } finally {
      flushing = false;
    }
  }
  const timer = setInterval(() => {
    void flush();
  }, 5000);
  timer.unref();
  void flush();
  return {
    async publish(event: NexoraEvent) {
      const name = `${Date.now()}-${randomUUID()}`;
      const temporary = join(directory, `${name}.tmp`);
      await writeFile(temporary, JSON.stringify(event), { mode: 0o600, flag: "wx" });
      await rename(temporary, join(directory, `${name}.json`));
      void flush();
    },
  };
}
