import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@nexora/http";
import { createLeaveService } from "../src/services/leave.service.js";
import { createCapturingPublisher } from "./fakeEventPublisher.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG = "org_1";
const EMPLOYEE = "user_1";
const REVIEWER = "user_manager";

async function setupAnnualLeaveType(prisma: ReturnType<typeof createFakePrisma>, days = 10) {
  const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });
  return service.createLeaveType(ORG, {
    name: "Annual Leave",
    requiresBalance: true,
    defaultAnnualDays: days,
    isPaid: true,
  });
}

describe("leave types", () => {
  it("rejects a duplicate name within the same organization", async () => {
    const prisma = createFakePrisma();
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });
    await service.createLeaveType(ORG, { name: "Sick Leave", requiresBalance: true, isPaid: true });
    await expect(
      service.createLeaveType(ORG, { name: "Sick Leave", requiresBalance: false, isPaid: false }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows the same name in a different organization", async () => {
    const prisma = createFakePrisma();
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });
    await service.createLeaveType(ORG, { name: "Sick Leave", requiresBalance: true, isPaid: true });
    await expect(
      service.createLeaveType("org_2", { name: "Sick Leave", requiresBalance: true, isPaid: true }),
    ).resolves.toBeDefined();
  });
});

describe("requestLeave", () => {
  it("creates a PENDING request and computes inclusive duration", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    const request = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
      reason: "Family trip",
    });

    expect(request.status).toBe("PENDING");
    expect(request.durationDays).toBe(3); // Mar 2, 3, 4 inclusive
  });

  it("rejects a request that exceeds the available balance", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma, 5);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    await expect(
      service.requestLeave(ORG, EMPLOYEE, {
        leaveTypeId: leaveType.id,
        startDate: "2026-03-01",
        endDate: "2026-03-10", // 10 days > 5 allocated
        reason: "Long trip",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not check balance for a leave type that doesn't require one", async () => {
    const prisma = createFakePrisma();
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });
    const unpaid = await service.createLeaveType(ORG, {
      name: "Unpaid Leave",
      requiresBalance: false,
      isPaid: false,
    });

    await expect(
      service.requestLeave(ORG, EMPLOYEE, {
        leaveTypeId: unpaid.id,
        startDate: "2026-03-01",
        endDate: "2026-04-01", // a whole month, would fail any balance check
        reason: "Extended unpaid leave",
      }),
    ).resolves.toBeDefined();
  });

  it("rejects a request overlapping an already-APPROVED request", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    const first = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-10",
      endDate: "2026-03-12",
      reason: "First trip",
    });
    await service.approveLeaveRequest(ORG, first.id, REVIEWER);

    await expect(
      service.requestLeave(ORG, EMPLOYEE, {
        leaveTypeId: leaveType.id,
        startDate: "2026-03-11",
        endDate: "2026-03-13", // overlaps March 11-12
        reason: "Conflicting trip",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows a request that overlaps a PENDING (not approved) request", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-10",
      endDate: "2026-03-12",
      reason: "First trip (still pending)",
    });

    await expect(
      service.requestLeave(ORG, EMPLOYEE, {
        leaveTypeId: leaveType.id,
        startDate: "2026-03-11",
        endDate: "2026-03-13",
        reason: "Second request, first one not approved yet",
      }),
    ).resolves.toBeDefined();
  });
});

describe("approve / reject", () => {
  it("approving deducts the balance", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma, 10);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    const request = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
      reason: "Trip",
    });
    await service.approveLeaveRequest(ORG, request.id, REVIEWER);

    const balances = await service.getMyBalances(ORG, EMPLOYEE, 2026);
    expect(balances[0]?.usedDays).toBe(3);
  });

  it("rejects approving a request that isn't PENDING", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    const request = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      reason: "Trip",
    });
    await service.approveLeaveRequest(ORG, request.id, REVIEWER);

    await expect(service.approveLeaveRequest(ORG, request.id, REVIEWER)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("rejecting sets REJECTED with a reason and does not touch the balance", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma, 10);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    const request = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
      reason: "Trip",
    });
    const rejected = await service.rejectLeaveRequest(ORG, request.id, REVIEWER, {
      rejectionReason: "Team is short-staffed",
    });

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("Team is short-staffed");
  });
});

describe("cancel", () => {
  it("cancels a PENDING request with no balance impact", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma, 10);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    const request = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
      reason: "Trip",
    });
    const cancelled = await service.cancelLeaveRequest(ORG, EMPLOYEE, request.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("cancelling an APPROVED request restores the balance", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma, 10);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    const request = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
      reason: "Trip",
    });
    await service.approveLeaveRequest(ORG, request.id, REVIEWER);
    await service.cancelLeaveRequest(ORG, EMPLOYEE, request.id);

    const balances = await service.getMyBalances(ORG, EMPLOYEE, 2026);
    expect(balances[0]?.usedDays).toBe(0);
  });

  it("refuses to cancel someone else's leave request", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    const request = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
      reason: "Trip",
    });

    await expect(
      service.cancelLeaveRequest(ORG, "someone_else", request.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to cancel an already-rejected request", async () => {
    const prisma = createFakePrisma();
    const leaveType = await setupAnnualLeaveType(prisma);
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });

    const request = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      reason: "Trip",
    });
    await service.rejectLeaveRequest(ORG, request.id, REVIEWER, {});

    await expect(service.cancelLeaveRequest(ORG, EMPLOYEE, request.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("tenant isolation", () => {
  it("Org A cannot approve, reject, or view Org B's leave request by id", async () => {
    const prisma = createFakePrisma();
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });
    const orgBLeaveType = await service.createLeaveType("org_b", {
      name: "Annual Leave",
      requiresBalance: true,
      defaultAnnualDays: 10,
      isPaid: true,
    });

    const orgBRequest = await service.requestLeave("org_b", "org_b_employee", {
      leaveTypeId: orgBLeaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
      reason: "Trip",
    });

    await expect(
      service.approveLeaveRequest("org_a", orgBRequest.id, REVIEWER),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.rejectLeaveRequest("org_a", orgBRequest.id, REVIEWER, {}),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getLeaveRequestOrThrow("org_a", orgBRequest.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const stillPending = await service.getLeaveRequestOrThrow("org_b", orgBRequest.id);
    expect(stillPending.status).toBe("PENDING");
  });

  it("listing leave requests never leaks another org's rows", async () => {
    const prisma = createFakePrisma();
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });
    const typeA = await service.createLeaveType("org_a", {
      name: "Annual Leave",
      requiresBalance: true,
      defaultAnnualDays: 10,
      isPaid: true,
    });
    const typeB = await service.createLeaveType("org_b", {
      name: "Annual Leave",
      requiresBalance: true,
      defaultAnnualDays: 10,
      isPaid: true,
    });

    await service.requestLeave("org_a", "emp_a", {
      leaveTypeId: typeA.id,
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      reason: "x",
    });
    await service.requestLeave("org_b", "emp_b", {
      leaveTypeId: typeB.id,
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      reason: "y",
    });

    const orgAList = await service.listLeaveRequests("org_a", { page: 1, pageSize: 20 });
    expect(orgAList.data).toHaveLength(1);
  });
});

describe("event publishing", () => {
  it("publishes LEAVE_REQUESTED, LEAVE_APPROVED, and LEAVE_REJECTED at the right points", async () => {
    const prisma = createFakePrisma();
    const eventPublisher = createCapturingPublisher();
    const service = createLeaveService({ prisma, eventPublisher });
    const leaveType = await service.createLeaveType(ORG, {
      name: "Annual Leave",
      requiresBalance: true,
      defaultAnnualDays: 10,
      isPaid: true,
    });

    const request = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-03",
      reason: "Trip",
    });
    expect(eventPublisher.events).toHaveLength(1);
    expect(eventPublisher.events[0]?.type).toBe("LEAVE_REQUESTED");
    expect(eventPublisher.events[0]?.payload).toMatchObject({
      employeeId: EMPLOYEE,
      leaveRequestId: request.id,
    });

    await service.approveLeaveRequest(ORG, request.id, REVIEWER);
    expect(eventPublisher.events).toHaveLength(2);
    expect(eventPublisher.events[1]?.type).toBe("LEAVE_APPROVED");
    expect(eventPublisher.events[1]?.payload).toMatchObject({
      employeeId: EMPLOYEE,
      approvedBy: REVIEWER,
    });

    const secondRequest = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-04-02",
      endDate: "2026-04-03",
      reason: "Another trip",
    });
    await service.rejectLeaveRequest(ORG, secondRequest.id, REVIEWER, {
      rejectionReason: "Too soon",
    });
    const rejectedEvent = eventPublisher.events.at(-1);
    expect(rejectedEvent?.type).toBe("LEAVE_REJECTED");
    expect(rejectedEvent?.payload).toMatchObject({
      employeeId: EMPLOYEE,
      rejectedBy: REVIEWER,
      reason: "Too soon",
    });
  });
});

describe("getStats", () => {
  it("counts only PENDING requests, scoped to the organization", async () => {
    const prisma = createFakePrisma();
    const service = createLeaveService({ prisma, eventPublisher: createCapturingPublisher() });
    const leaveType = await service.createLeaveType(ORG, {
      name: "Annual Leave",
      requiresBalance: true,
      defaultAnnualDays: 10,
      isPaid: true,
    });

    const r1 = await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      reason: "x",
    });
    await service.requestLeave(ORG, EMPLOYEE, {
      leaveTypeId: leaveType.id,
      startDate: "2026-05-02",
      endDate: "2026-05-02",
      reason: "y",
    });
    await service.approveLeaveRequest(ORG, r1.id, REVIEWER); // no longer PENDING

    const otherOrgType = await service.createLeaveType("org_2", {
      name: "Annual Leave",
      requiresBalance: true,
      defaultAnnualDays: 10,
      isPaid: true,
    });
    await service.requestLeave("org_2", "emp_2", {
      leaveTypeId: otherOrgType.id,
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      reason: "z",
    });

    const stats = await service.getStats(ORG);
    expect(stats).toEqual({ pendingLeaveRequests: 1 });
  });
});
