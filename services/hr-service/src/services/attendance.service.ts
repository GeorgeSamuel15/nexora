import { omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import type { PaginatedResult } from "@nexora/types";
import type { ListAttendanceQuery } from "../validation/attendance.schemas.js";
/**
 * `employeeId` throughout this service is the person's auth-service
 * userId (from the verified JWT), not user-service's internal Employee.id
 * primary key. This is a deliberate choice: clock-in/out is a hot,
 * self-service action that shouldn't need a synchronous cross-service
 * call to user-service just to resolve an identifier on every request.
 * Enriching attendance records with employee names for display is left
 * to the frontend/gateway layer, which already has both this data and
 * user-service's - see services/hr-service/README.md.
 */
export interface AttendanceServiceDeps {
  prisma: PrismaClient;
  now?: () => Date;
}
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
export function createAttendanceService(deps: AttendanceServiceDeps) {
  const { prisma } = deps;
  const now = deps.now ?? (() => new Date());
  async function clockIn(organizationId: string, employeeId: string) {
    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: { organizationId, employeeId, status: "ACTIVE" },
    });
    if (activeRecord) {
      throw new ConflictError("Already clocked in - clock out first.");
    }
    const clockInAt = now();
    return prisma.attendanceRecord.create({
      data: omitUndefined({
        organizationId,
        employeeId,
        date: startOfDay(clockInAt),
        clockInAt,
        status: "ACTIVE",
      }),
    });
  }
  async function clockOut(organizationId: string, employeeId: string) {
    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: { organizationId, employeeId, status: "ACTIVE" },
    });
    if (!activeRecord) {
      throw new ConflictError("Not currently clocked in.");
    }
    const clockOutAt = now();
    // clockOutAt is always server-generated "now", so it can never be
    // before clockInAt by construction - there's no client-supplied
    // timestamp to validate against here (no manual time entry in V1).
    const totalMinutes = Math.round(
      (clockOutAt.getTime() - activeRecord.clockInAt.getTime()) / 60000,
    );
    return prisma.attendanceRecord.update({
      where: { id: activeRecord.id },
      data: omitUndefined({ clockOutAt, totalMinutes, status: "COMPLETED" }),
    });
  }
  async function listMyAttendance(
    organizationId: string,
    employeeId: string,
    pagination: {
      page: number;
      pageSize: number;
    },
  ) {
    return listAttendance(organizationId, { ...pagination, employeeId });
  }
  async function listAttendance(
    organizationId: string,
    query: ListAttendanceQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.attendanceRecord.findMany({ where, skip, take, orderBy: { clockInAt: "desc" } }),
      prisma.attendanceRecord.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function getAttendanceRecord(organizationId: string, recordId: string) {
    const record = await prisma.attendanceRecord.findFirst({
      where: { id: recordId, organizationId },
    });
    if (!record) {
      throw new NotFoundError("Attendance record");
    }
    return record;
  }
  return { clockIn, clockOut, listMyAttendance, listAttendance, getAttendanceRecord };
}
export type AttendanceService = ReturnType<typeof createAttendanceService>;
