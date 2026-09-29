import { toJsonObject } from "@nexora/utils";
import type { NexoraEvent } from "@nexora/events";
import type { AuditEntry } from "@nexora/audit-client";
/**
 * Unlike notification-service's mapper, every NexoraEvent maps to an
 * audit entry here - there's no equivalent of "TASK_COMPLETED has no
 * clear recipient" problem for audit logging, since audit doesn't need a
 * person to notify, just a record of what happened and who did it. Every
 * event already carries an actor and enough context for that.
 *
 * This only covers the events that exist on the bus as of Phase 10.
 * Several actions the build spec explicitly calls out for auditing
 * (login/logout, employee creation/updates, role changes, document
 * deletion) have no corresponding NexoraEvent - those are recorded via
 * direct calls to @nexora/audit-client at their call sites instead (see
 * each service's own use of createHttpAuditClient), not through this
 * mapper. This function only handles the event-sourced half of the audit
 * trail.
 */
export function mapEventToAuditEntry(event: NexoraEvent): AuditEntry {
  const base = {
    organizationId: event.organizationId,
    metadata: toJsonObject({ occurredAt: event.occurredAt }),
  };
  switch (event.type) {
    case "EMPLOYEE_INVITED":
      return {
        ...base,
        actorId: event.payload.invitedBy,
        action: "EMPLOYEE_INVITED",
        entityType: "invitation",
        entityId: event.payload.invitationId,
      };
    case "LEAVE_REQUESTED":
      return {
        ...base,
        actorId: event.payload.employeeId,
        action: "LEAVE_REQUESTED",
        entityType: "leave_request",
        entityId: event.payload.leaveRequestId,
      };
    case "LEAVE_APPROVED":
      return {
        ...base,
        actorId: event.payload.approvedBy,
        action: "LEAVE_APPROVED",
        entityType: "leave_request",
        entityId: event.payload.leaveRequestId,
      };
    case "LEAVE_REJECTED":
      return {
        ...base,
        actorId: event.payload.rejectedBy,
        action: "LEAVE_REJECTED",
        entityType: "leave_request",
        entityId: event.payload.leaveRequestId,
      };
    case "TASK_ASSIGNED":
      return {
        ...base,
        actorId: event.payload.assignedBy,
        action: "TASK_ASSIGNED",
        entityType: "task",
        entityId: event.payload.taskId,
      };
    case "TASK_COMPLETED":
      return {
        ...base,
        actorId: event.payload.completedBy,
        action: "TASK_COMPLETED",
        entityType: "task",
        entityId: event.payload.taskId,
      };
    case "DEAL_WON":
      return {
        ...base,
        actorId: event.payload.ownerId,
        action: "DEAL_WON",
        entityType: "deal",
        entityId: event.payload.dealId,
      };
    case "INVOICE_CREATED":
      return {
        ...base,
        actorId: event.payload.createdBy,
        action: "INVOICE_CREATED",
        entityType: "invoice",
        entityId: event.payload.invoiceId,
      };
    case "PAYMENT_RECEIVED":
      // No actor field on this event (see notification-service's
      // eventMapper.ts for the same gap) - "system" is honest about that
      // rather than guessing a user id that isn't there.
      return {
        ...base,
        actorId: "system",
        action: "PAYMENT_RECEIVED",
        entityType: "payment",
        entityId: event.payload.paymentId,
      };
    case "DOCUMENT_SHARED":
      return {
        ...base,
        actorId: event.payload.sharedBy,
        action: "DOCUMENT_SHARED",
        entityType: "document",
        entityId: event.payload.documentId,
      };
  }
}
