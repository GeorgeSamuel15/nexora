import { omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError, ValidationError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import {
  buildEvent,
  type EventPublisher,
  type LeaveApprovedEvent,
  type LeaveRejectedEvent,
  type LeaveRequestedEvent,
} from "@nexora/events";
import type { PaginatedResult } from "@nexora/types";
import type {
  CreateLeaveRequestInput,
  CreateLeaveTypeInput,
  ListLeaveRequestsQuery,
  RejectLeaveRequestInput,
  UpdateLeaveTypeInput,
} from "../validation/leave.schemas.js";
export interface LeaveServiceDeps {
  prisma: PrismaClient;
  eventPublisher: EventPublisher;
  now?: () => Date;
}
/** Inclusive calendar-day count between two YYYY-MM-DD dates. No business-
 * day/holiday exclusion in V1 - the build spec doesn't ask for a holiday
 * calendar, and adding one is a bigger feature than "prevent negative
 * duration" warrants. */
function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
export function createLeaveService(deps: LeaveServiceDeps) {
  const { prisma, eventPublisher } = deps;
  const now = deps.now ?? (() => new Date());
  // ---- Leave types --------------------------------------------------
  async function createLeaveType(organizationId: string, input: CreateLeaveTypeInput) {
    const existing = await prisma.leaveType.findUnique({
      where: { organizationId_name: { organizationId, name: input.name } },
    });
    if (existing) {
      throw new ConflictError(`A leave type named "${input.name}" already exists.`);
    }
    return prisma.leaveType.create({ data: omitUndefined({ organizationId, ...input }) });
  }
  async function listLeaveTypes(organizationId: string) {
    return prisma.leaveType.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }
  async function updateLeaveType(
    organizationId: string,
    leaveTypeId: string,
    input: UpdateLeaveTypeInput,
  ) {
    const result = await prisma.leaveType.updateMany({
      where: { id: leaveTypeId, organizationId },
      data: omitUndefined(input),
    });
    if (result.count === 0) {
      throw new NotFoundError("Leave type");
    }
    return prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
  }
  async function getLeaveTypeOrThrow(organizationId: string, leaveTypeId: string) {
    const leaveType = await prisma.leaveType.findFirst({
      where: { id: leaveTypeId, organizationId },
    });
    if (!leaveType) {
      throw new NotFoundError("Leave type");
    }
    return leaveType;
  }
  // ---- Balances -------------------------------------------------------
  /** Balances are lazily provisioned on first use per (employee, leave
   * type, year) rather than pre-created for every employee up front -
   * simpler, and avoids a backfill job every time a new leave type or
   * employee is added. */
  async function getOrCreateBalance(
    organizationId: string,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    defaultAllocatedDays: number,
  ) {
    return prisma.leaveBalance.upsert({
      where: {
        organizationId_employeeId_leaveTypeId_year: {
          organizationId,
          employeeId,
          leaveTypeId,
          year,
        },
      },
      create: {
        organizationId,
        employeeId,
        leaveTypeId,
        year,
        allocatedDays: defaultAllocatedDays,
        usedDays: 0,
      },
      update: {},
    });
  }
  async function getMyBalances(organizationId: string, employeeId: string, year: number) {
    return prisma.leaveBalance.findMany({ where: { organizationId, employeeId, year } });
  }
  // ---- Leave requests -------------------------------------------------
  async function requestLeave(
    organizationId: string,
    employeeId: string,
    input: CreateLeaveRequestInput,
  ) {
    const leaveType = await getLeaveTypeOrThrow(organizationId, input.leaveTypeId);
    const durationDays = inclusiveDayCount(input.startDate, input.endDate);
    if (durationDays <= 0) {
      throw new ValidationError("Leave duration must be at least one day.");
    }
    const overlapping = await prisma.leaveRequest.findFirst({
      where: {
        organizationId,
        employeeId,
        status: "APPROVED",
        startDate: { lte: new Date(`${input.endDate}T00:00:00Z`) },
        endDate: { gte: new Date(`${input.startDate}T00:00:00Z`) },
      },
    });
    if (overlapping) {
      throw new ConflictError("This overlaps with an already-approved leave request.");
    }
    if (leaveType.requiresBalance) {
      const year = new Date(`${input.startDate}T00:00:00Z`).getUTCFullYear();
      const balance = await getOrCreateBalance(
        organizationId,
        employeeId,
        leaveType.id,
        year,
        leaveType.defaultAnnualDays ?? 0,
      );
      const available = balance.allocatedDays - balance.usedDays;
      if (durationDays > available) {
        throw new ConflictError(
          `Insufficient leave balance: requested ${durationDays} day(s), ${available} available.`,
        );
      }
    }
    const request = await prisma.leaveRequest.create({
      data: omitUndefined({
        organizationId,
        employeeId,
        leaveTypeId: leaveType.id,
        startDate: new Date(`${input.startDate}T00:00:00Z`),
        endDate: new Date(`${input.endDate}T00:00:00Z`),
        durationDays,
        reason: input.reason,
        status: "PENDING",
      }),
    });
    await eventPublisher.publish(
      buildEvent<LeaveRequestedEvent>("LEAVE_REQUESTED", organizationId, {
        leaveRequestId: request.id,
        employeeId,
        leaveType: leaveType.name,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    );
    return request;
  }
  async function getLeaveRequestOrThrow(organizationId: string, requestId: string) {
    const request = await prisma.leaveRequest.findFirst({
      where: { id: requestId, organizationId },
    });
    if (!request) {
      throw new NotFoundError("Leave request");
    }
    return request;
  }
  async function approveLeaveRequest(
    organizationId: string,
    requestId: string,
    reviewedBy: string,
  ) {
    const request = await getLeaveRequestOrThrow(organizationId, requestId);
    if (request.status !== "PENDING") {
      throw new ConflictError(
        `Only PENDING requests can be approved (this one is ${request.status}).`,
      );
    }
    const leaveType = await getLeaveTypeOrThrow(organizationId, request.leaveTypeId);
    if (leaveType.requiresBalance) {
      const year = request.startDate.getUTCFullYear();
      const balance = await getOrCreateBalance(
        organizationId,
        request.employeeId,
        leaveType.id,
        year,
        leaveType.defaultAnnualDays ?? 0,
      );
      const available = balance.allocatedDays - balance.usedDays;
      // Re-checked at approval time too, in case balance changed (another
      // request approved) between the original submission and now.
      if (request.durationDays > available) {
        throw new ConflictError(
          `Insufficient leave balance to approve: requesting ${request.durationDays} day(s), ${available} available.`,
        );
      }
      await prisma.$transaction([
        prisma.leaveRequest.update({
          where: { id: request.id },
          data: omitUndefined({ status: "APPROVED", reviewedBy, reviewedAt: now() }),
        }),
        prisma.leaveBalance.update({
          where: {
            organizationId_employeeId_leaveTypeId_year: {
              organizationId,
              employeeId: request.employeeId,
              leaveTypeId: leaveType.id,
              year,
            },
          },
          data: omitUndefined({ usedDays: balance.usedDays + request.durationDays }),
        }),
      ]);
    } else {
      await prisma.leaveRequest.update({
        where: { id: request.id },
        data: omitUndefined({ status: "APPROVED", reviewedBy, reviewedAt: now() }),
      });
    }
    await eventPublisher.publish(
      buildEvent<LeaveApprovedEvent>("LEAVE_APPROVED", organizationId, {
        leaveRequestId: request.id,
        employeeId: request.employeeId,
        approvedBy: reviewedBy,
      }),
    );
    return getLeaveRequestOrThrow(organizationId, requestId);
  }
  async function rejectLeaveRequest(
    organizationId: string,
    requestId: string,
    reviewedBy: string,
    input: RejectLeaveRequestInput,
  ) {
    const request = await getLeaveRequestOrThrow(organizationId, requestId);
    if (request.status !== "PENDING") {
      throw new ConflictError(
        `Only PENDING requests can be rejected (this one is ${request.status}).`,
      );
    }
    const rejected = await prisma.leaveRequest.update({
      where: { id: request.id },
      data: omitUndefined({
        status: "REJECTED",
        reviewedBy,
        reviewedAt: now(),
        rejectionReason: input.rejectionReason,
      }),
    });
    await eventPublisher.publish(
      buildEvent<LeaveRejectedEvent>("LEAVE_REJECTED", organizationId, {
        leaveRequestId: request.id,
        employeeId: request.employeeId,
        rejectedBy: reviewedBy,
        ...(input.rejectionReason === undefined ? {} : { reason: input.rejectionReason }),
      }),
    );
    return rejected;
  }
  async function cancelLeaveRequest(organizationId: string, employeeId: string, requestId: string) {
    const request = await prisma.leaveRequest.findFirst({
      where: { id: requestId, organizationId, employeeId },
    });
    if (!request) {
      throw new NotFoundError("Leave request");
    }
    if (request.status !== "PENDING" && request.status !== "APPROVED") {
      throw new ConflictError(`This request is already ${request.status} and can't be cancelled.`);
    }
    if (request.status === "APPROVED") {
      const leaveType = await getLeaveTypeOrThrow(organizationId, request.leaveTypeId);
      if (leaveType.requiresBalance) {
        const year = request.startDate.getUTCFullYear();
        const balance = await getOrCreateBalance(
          organizationId,
          employeeId,
          leaveType.id,
          year,
          leaveType.defaultAnnualDays ?? 0,
        );
        await prisma.$transaction([
          prisma.leaveRequest.update({
            where: { id: request.id },
            data: omitUndefined({ status: "CANCELLED" }),
          }),
          prisma.leaveBalance.update({
            where: {
              organizationId_employeeId_leaveTypeId_year: {
                organizationId,
                employeeId,
                leaveTypeId: leaveType.id,
                year,
              },
            },
            data: omitUndefined({ usedDays: Math.max(0, balance.usedDays - request.durationDays) }),
          }),
        ]);
        return getLeaveRequestOrThrow(organizationId, requestId);
      }
    }
    return prisma.leaveRequest.update({
      where: { id: request.id },
      data: omitUndefined({ status: "CANCELLED" }),
    });
  }
  async function listMyLeaveRequests(
    organizationId: string,
    employeeId: string,
    pagination: {
      page: number;
      pageSize: number;
    },
  ) {
    return listLeaveRequests(organizationId, { ...pagination, employeeId });
  }
  async function listLeaveRequests(
    organizationId: string,
    query: ListLeaveRequestsQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.leaveRequest.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.leaveRequest.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  /** Backs analytics-service's dashboard aggregation (Phase 11). */
  async function getStats(organizationId: string) {
    const pendingLeaveRequests = await prisma.leaveRequest.count({
      where: { organizationId, status: "PENDING" },
    });
    return { pendingLeaveRequests };
  }
  return {
    createLeaveType,
    listLeaveTypes,
    updateLeaveType,
    getMyBalances,
    requestLeave,
    approveLeaveRequest,
    rejectLeaveRequest,
    cancelLeaveRequest,
    listMyLeaveRequests,
    listLeaveRequests,
    getLeaveRequestOrThrow,
    getStats,
  };
}
export type LeaveService = ReturnType<typeof createLeaveService>;
