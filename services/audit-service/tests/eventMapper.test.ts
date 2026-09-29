import { describe, expect, it } from "vitest";
import { mapEventToAuditEntry } from "../src/eventMapper.js";
import type { NexoraEvent, NexoraEventType } from "@nexora/events";

/**
 * mapEventToAuditEntry imports NexoraEvent/AuditEntry as types only, so
 * like notification-service's eventMapper, it has zero runtime
 * dependencies and was genuinely executed via tsx during development -
 * see services/audit-service/README.md.
 */

function baseEvent(type: NexoraEventType, payload: Record<string, unknown>): NexoraEvent {
  return {
    type,
    organizationId: "org_1",
    occurredAt: "2026-03-01T00:00:00.000Z",
    payload,
  } as unknown as NexoraEvent;
}

describe("mapEventToAuditEntry", () => {
  it("maps TASK_ASSIGNED's actor to the assigner, not the assignee", () => {
    const entry = mapEventToAuditEntry(
      baseEvent("TASK_ASSIGNED", {
        taskId: "task_1",
        taskTitle: "x",
        assigneeId: "user_2",
        assignedBy: "user_1",
      }),
    );
    expect(entry.actorId).toBe("user_1");
    expect(entry.entityType).toBe("task");
    expect(entry.entityId).toBe("task_1");
  });

  it("maps LEAVE_APPROVED's actor to the approver, not the employee", () => {
    const entry = mapEventToAuditEntry(
      baseEvent("LEAVE_APPROVED", {
        leaveRequestId: "lr_1",
        employeeId: "user_3",
        approvedBy: "user_manager",
      }),
    );
    expect(entry.actorId).toBe("user_manager");
  });

  it("honestly uses 'system' as the actor for PAYMENT_RECEIVED, which carries no actor field", () => {
    const entry = mapEventToAuditEntry(
      baseEvent("PAYMENT_RECEIVED", {
        paymentId: "pay_1",
        invoiceId: "inv_1",
        amount: 500,
        method: "card",
      }),
    );
    expect(entry.actorId).toBe("system");
  });

  it("maps DOCUMENT_SHARED's actor to the sharer", () => {
    const entry = mapEventToAuditEntry(
      baseEvent("DOCUMENT_SHARED", {
        documentId: "doc_1",
        sharedBy: "user_1",
        sharedWith: "user_5",
      }),
    );
    expect(entry.actorId).toBe("user_1");
    expect(entry.entityType).toBe("document");
  });

  it("produces a complete entry for every event type - unlike notification's mapper, none return null", () => {
    const samples: Record<NexoraEventType, Record<string, unknown>> = {
      EMPLOYEE_INVITED: { invitationId: "i1", email: "a@b.com", invitedBy: "u1", role: "EMPLOYEE" },
      LEAVE_REQUESTED: {
        leaveRequestId: "l1",
        employeeId: "u1",
        leaveType: "Annual",
        startDate: "2026-01-01",
        endDate: "2026-01-02",
      },
      LEAVE_APPROVED: { leaveRequestId: "l1", employeeId: "u1", approvedBy: "u2" },
      LEAVE_REJECTED: { leaveRequestId: "l1", employeeId: "u1", rejectedBy: "u2" },
      TASK_ASSIGNED: { taskId: "t1", taskTitle: "x", assigneeId: "u1", assignedBy: "u2" },
      TASK_COMPLETED: { taskId: "t1", taskTitle: "x", completedBy: "u1" },
      DEAL_WON: { dealId: "d1", dealTitle: "x", clientId: "c1", value: 1, ownerId: "u1" },
      INVOICE_CREATED: {
        invoiceId: "i1",
        invoiceNumber: "INV-1",
        clientId: "c1",
        total: 1,
        createdBy: "u1",
      },
      PAYMENT_RECEIVED: { paymentId: "p1", invoiceId: "i1", amount: 1, method: "card" },
      DOCUMENT_SHARED: { documentId: "d1", sharedBy: "u1", sharedWith: "u2" },
    };

    for (const [type, payload] of Object.entries(samples) as [
      NexoraEventType,
      Record<string, unknown>,
    ][]) {
      const entry = mapEventToAuditEntry(baseEvent(type, payload));
      expect(entry.entityId, `${type} entityId`).toBeTruthy();
      expect(entry.actorId, `${type} actorId`).toBeTruthy();
      expect(entry.action, `${type} action`).toBe(type);
    }
  });
});
