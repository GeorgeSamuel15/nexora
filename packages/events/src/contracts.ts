/**
 * @nexora/events - event contracts
 *
 * Typed event contracts published/consumed over RabbitMQ (build spec
 * sections 16-17). Publishers and consumers import from "@nexora/events"
 * (index.ts re-exports everything here plus the RabbitMQ transport in
 * rabbitmq.ts) instead of agreeing on shapes informally, so a payload
 * change is a type error at compile time everywhere it's used.
 *
 * Split into its own file (separate from rabbitmq.ts) specifically so
 * rabbitmq.ts can import EventPublisher/NexoraEvent/routingKeyFor from
 * here without creating a circular import with index.ts.
 */

import type { UUID } from "@nexora/types";

interface BaseEvent<TType extends string, TPayload> {
  type: TType;
  organizationId: UUID;
  occurredAt: string; // ISO-8601
  payload: TPayload;
}

export type EmployeeInvitedEvent = BaseEvent<
  "EMPLOYEE_INVITED",
  { invitationId: UUID; email: string; invitedBy: UUID; role: string }
>;

export type LeaveRequestedEvent = BaseEvent<
  "LEAVE_REQUESTED",
  { leaveRequestId: UUID; employeeId: UUID; leaveType: string; startDate: string; endDate: string }
>;

export type LeaveApprovedEvent = BaseEvent<
  "LEAVE_APPROVED",
  { leaveRequestId: UUID; employeeId: UUID; approvedBy: UUID }
>;

export type LeaveRejectedEvent = BaseEvent<
  "LEAVE_REJECTED",
  { leaveRequestId: UUID; employeeId: UUID; rejectedBy: UUID; reason?: string }
>;

export type TaskAssignedEvent = BaseEvent<
  "TASK_ASSIGNED",
  { taskId: UUID; taskTitle: string; assigneeId: UUID; assignedBy: UUID }
>;

export type TaskCompletedEvent = BaseEvent<
  "TASK_COMPLETED",
  { taskId: UUID; taskTitle: string; completedBy: UUID }
>;

export type DealWonEvent = BaseEvent<
  "DEAL_WON",
  { dealId: UUID; dealTitle: string; clientId: UUID; value: number; ownerId: UUID }
>;

export type InvoiceCreatedEvent = BaseEvent<
  "INVOICE_CREATED",
  { invoiceId: UUID; invoiceNumber: string; clientId: UUID; total: number; createdBy: UUID }
>;

export type PaymentReceivedEvent = BaseEvent<
  "PAYMENT_RECEIVED",
  { paymentId: UUID; invoiceId: UUID; amount: number; method: string }
>;

export type DocumentSharedEvent = BaseEvent<
  "DOCUMENT_SHARED",
  { documentId: UUID; sharedBy: UUID; sharedWith: UUID }
>;

export type NexoraEvent =
  | EmployeeInvitedEvent
  | LeaveRequestedEvent
  | LeaveApprovedEvent
  | LeaveRejectedEvent
  | TaskAssignedEvent
  | TaskCompletedEvent
  | DealWonEvent
  | InvoiceCreatedEvent
  | PaymentReceivedEvent
  | DocumentSharedEvent;

export type NexoraEventType = NexoraEvent["type"];

/** RabbitMQ routing key convention: "nexora.<domain>.<event-name-kebab>". */
export function routingKeyFor(eventType: NexoraEventType): string {
  const domain = eventType.split("_")[0]?.toLowerCase() ?? "general";
  const kebab = eventType.toLowerCase().replace(/_/g, "-");
  return `nexora.${domain}.${kebab}`;
}

/** Type-safe helper for constructing an event envelope at the publish site. */
export function buildEvent<TEvent extends NexoraEvent>(
  type: TEvent["type"],
  organizationId: UUID,
  payload: TEvent["payload"],
): TEvent {
  return {
    type,
    organizationId,
    occurredAt: new Date().toISOString(),
    payload,
  } as TEvent;
}

/**
 * Every service that publishes domain events depends on this interface,
 * not on RabbitMQ directly - so business logic (e.g. "when a deal is
 * marked WON, publish DEAL_WON") can be written and tested now, with the
 * real RabbitMQ-backed implementation dropped in during Phase 10 without
 * touching any call site.
 */
export interface EventPublisher {
  publish<TEvent extends NexoraEvent>(event: TEvent): Promise<void>;
}

interface EventLogger {
  info(message: string, meta?: Record<string, unknown>): void;
}

/** Default publisher until Phase 10 wires up real RabbitMQ - logs what
 * would have been published (including its routing key) instead of
 * silently discarding it, so the event trail is still visible in
 * development and in tests that inject a capturing logger. */
export function createNoopEventPublisher(logger: EventLogger): EventPublisher {
  return {
    async publish(event) {
      logger.info("event ready to publish (RabbitMQ wiring lands in Phase 10)", {
        type: event.type,
        routingKey: routingKeyFor(event.type),
        organizationId: event.organizationId,
      });
    },
  };
}
