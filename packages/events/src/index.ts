/**
 * @nexora/events
 *
 * Barrel export: event contracts (contracts.ts) plus the real RabbitMQ
 * transport (rabbitmq.ts). Every consumer imports from "@nexora/events"
 * alone - the split into two source files is purely internal, to avoid a
 * circular import (rabbitmq.ts needs EventPublisher/routingKeyFor, which
 * live in contracts.ts, not here).
 */
export * from "./contracts.js";
export { createRabbitMqEventPublisher, createResilientEventPublisher } from "./rabbitmq.js";
export type { RabbitMqEventPublisher, RabbitMqPublisherConfig } from "./rabbitmq.js";
