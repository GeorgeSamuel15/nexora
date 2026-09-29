import { describe, expect, it } from "vitest";
import { mapEventToNotification } from "../src/eventMapper.js";
import type { NexoraEvent } from "@nexora/events";

/**
 * mapEventToNotification only ever imports NexoraEvent as a type (erased
 * at compile time), so this file - like the function under test - has no
 * runtime dependency on @nexora/events actually being resolvable. It was
 * genuinely executed during development via `tsx`, not just type-checked
 * - see services/notification-service/README.md.
 */

function baseEvent<T extends NexoraEvent["type"]>(
  type: T,
  payload: Record<string, unknown>,
): NexoraEvent {
  return {
    type,
    organizationId: "org_1",
    occurredAt: new Date().toISOString(),
    payload,
  } as unknown as NexoraEvent;
}

describe("mapEventToNotification", () => {
  it("maps TASK_ASSIGNED to a notification for the assignee", () => {
    const result = mapEventToNotification(
      baseEvent("TASK_ASSIGNED", {
        taskId: "task_1",
        taskTitle: "Design homepage",
        assigneeId: "user_2",
        assignedBy: "user_1",
      }),
    );
    expect(result?.userId).toBe("user_2");
    expect(result?.body).toContain("Design homepage");
  });

  it("maps LEAVE_REQUESTED to a confirmation for the employee", () => {
    const result = mapEventToNotification(
      baseEvent("LEAVE_REQUESTED", {
        leaveRequestId: "lr_1",
        employeeId: "user_3",
        leaveType: "Annual Leave",
        startDate: "2026-03-01",
        endDate: "2026-03-03",
      }),
    );
    expect(result?.userId).toBe("user_3");
  });

  it("maps LEAVE_APPROVED to a notification for the employee", () => {
    const result = mapEventToNotification(
      baseEvent("LEAVE_APPROVED", {
        leaveRequestId: "lr_1",
        employeeId: "user_3",
        approvedBy: "user_manager",
      }),
    );
    expect(result?.userId).toBe("user_3");
  });

  it("includes the rejection reason in LEAVE_REJECTED's body when present", () => {
    const result = mapEventToNotification(
      baseEvent("LEAVE_REJECTED", {
        leaveRequestId: "lr_2",
        employeeId: "user_3",
        rejectedBy: "user_manager",
        reason: "Team is short-staffed",
      }),
    );
    expect(result?.body).toContain("Team is short-staffed");
  });

  it("maps DEAL_WON to a notification for the deal owner", () => {
    const result = mapEventToNotification(
      baseEvent("DEAL_WON", {
        dealId: "deal_1",
        dealTitle: "Acme renewal",
        clientId: "client_1",
        value: 50000,
        ownerId: "user_4",
      }),
    );
    expect(result?.userId).toBe("user_4");
  });

  it("maps INVOICE_CREATED to a confirmation for the creator", () => {
    const result = mapEventToNotification(
      baseEvent("INVOICE_CREATED", {
        invoiceId: "inv_1",
        invoiceNumber: "INV-001",
        clientId: "client_1",
        total: 1000,
        createdBy: "user_5",
      }),
    );
    expect(result?.userId).toBe("user_5");
  });

  it("maps DOCUMENT_SHARED to a notification for the recipient", () => {
    const result = mapEventToNotification(
      baseEvent("DOCUMENT_SHARED", {
        documentId: "doc_1",
        sharedBy: "user_1",
        sharedWith: "user_6",
      }),
    );
    expect(result?.userId).toBe("user_6");
  });

  it("deliberately produces no notification for TASK_COMPLETED (payload has no clear recipient)", () => {
    const result = mapEventToNotification(
      baseEvent("TASK_COMPLETED", { taskId: "task_1", taskTitle: "x", completedBy: "user_2" }),
    );
    expect(result).toBeNull();
  });

  it("deliberately produces no notification for PAYMENT_RECEIVED (payload has no clear recipient)", () => {
    const result = mapEventToNotification(
      baseEvent("PAYMENT_RECEIVED", {
        paymentId: "pay_1",
        invoiceId: "inv_1",
        amount: 500,
        method: "card",
      }),
    );
    expect(result).toBeNull();
  });
});
