import { toJsonObject } from "@nexora/utils";
import type { NexoraEvent } from "@nexora/events";
export interface NotificationDraft {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}
/**
 * Maps an incoming domain event to the notification it should produce,
 * or `null` if this event type isn't notification-worthy (either by
 * design, or because its payload doesn't carry a clear recipient - see
 * the TASK_COMPLETED and PAYMENT_RECEIVED cases below). Not every event
 * on the bus needs to reach a person - some exist for analytics-service
 * (Phase 11) or audit-service (Phase 12) instead.
 *
 * Deliberately pure (no I/O) so it's fully unit-testable without a
 * RabbitMQ connection or a database - see tests/eventMapper.test.ts.
 */
export function mapEventToNotification(event: NexoraEvent): NotificationDraft | null {
  switch (event.type) {
    case "EMPLOYEE_INVITED":
      // Confirms the invite was sent to the person who sent it - there's
      // no recipient userId yet (the invitee hasn't registered).
      return {
        userId: event.payload.invitedBy,
        type: event.type,
        title: "Invitation sent",
        body: `An invitation was sent to ${event.payload.email}.`,
        metadata: toJsonObject({
          invitationId: event.payload.invitationId,
          email: event.payload.email,
        }),
      };
    case "LEAVE_REQUESTED":
      return {
        userId: event.payload.employeeId,
        type: event.type,
        title: "Leave request submitted",
        body: `Your ${event.payload.leaveType} request for ${event.payload.startDate} - ${event.payload.endDate} was submitted.`,
        metadata: toJsonObject({ leaveRequestId: event.payload.leaveRequestId }),
      };
    case "LEAVE_APPROVED":
      return {
        userId: event.payload.employeeId,
        type: event.type,
        title: "Leave request approved",
        body: "Your leave request was approved.",
        metadata: toJsonObject({
          leaveRequestId: event.payload.leaveRequestId,
          approvedBy: event.payload.approvedBy,
        }),
      };
    case "LEAVE_REJECTED":
      return {
        userId: event.payload.employeeId,
        type: event.type,
        title: "Leave request rejected",
        body: event.payload.reason
          ? `Your leave request was rejected: ${event.payload.reason}`
          : "Your leave request was rejected.",
        metadata: toJsonObject({
          leaveRequestId: event.payload.leaveRequestId,
          rejectedBy: event.payload.rejectedBy,
        }),
      };
    case "TASK_ASSIGNED":
      return {
        userId: event.payload.assigneeId,
        type: event.type,
        title: "New task assigned",
        body: `You were assigned: ${event.payload.taskTitle}`,
        metadata: toJsonObject({
          taskId: event.payload.taskId,
          assignedBy: event.payload.assignedBy,
        }),
      };
    case "TASK_COMPLETED":
      // No notification: the payload (taskId, taskTitle, completedBy)
      // doesn't carry who should be told (creator? assignee? project
      // owner?) - adding that would mean changing the event contract
      // itself, which other services already publish against. Flagged
      // as a follow-up rather than guessing a recipient.
      return null;
    case "DEAL_WON":
      return {
        userId: event.payload.ownerId,
        type: event.type,
        title: "Deal won!",
        body: `${event.payload.dealTitle} was marked won (${event.payload.value}).`,
        metadata: toJsonObject({ dealId: event.payload.dealId, clientId: event.payload.clientId }),
      };
    case "INVOICE_CREATED":
      return {
        userId: event.payload.createdBy,
        type: event.type,
        title: "Invoice created",
        body: `Invoice ${event.payload.invoiceNumber} was created (${event.payload.total}).`,
        metadata: toJsonObject({ invoiceId: event.payload.invoiceId }),
      };
    case "PAYMENT_RECEIVED":
      // No notification: the payload (paymentId, invoiceId, amount,
      // method) doesn't carry who created/owns the invoice - same gap as
      // TASK_COMPLETED above. finance-service's InvoiceCreatedEvent has a
      // createdBy field; PaymentReceivedEvent doesn't carry the
      // equivalent, and inventing one here would mean guessing.
      return null;
    case "DOCUMENT_SHARED":
      return {
        userId: event.payload.sharedWith,
        type: event.type,
        title: "A document was shared with you",
        body: "Someone shared a document with you.",
        metadata: toJsonObject({
          documentId: event.payload.documentId,
          sharedBy: event.payload.sharedBy,
        }),
      };
    default:
      return null;
  }
}
