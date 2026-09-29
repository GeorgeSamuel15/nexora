import type { PrismaClient } from "../generated/client/index.js";

interface FakeAttendance {
  id: string;
  organizationId: string;
  employeeId: string;
  date: Date;
  clockInAt: Date;
  clockOutAt: Date | null;
  totalMinutes: number | null;
  status: "ACTIVE" | "COMPLETED";
  createdAt: Date;
  updatedAt: Date;
}

interface FakeLeaveType {
  id: string;
  organizationId: string;
  name: string;
  requiresBalance: boolean;
  defaultAnnualDays: number | null;
  isPaid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeLeaveBalance {
  id: string;
  organizationId: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allocatedDays: number;
  usedDays: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeLeaveRequest {
  id: string;
  organizationId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createFakePrisma() {
  const attendance = new Map<string, FakeAttendance>();
  const leaveTypes = new Map<string, FakeLeaveType>();
  const leaveBalances = new Map<string, FakeLeaveBalance>();
  const leaveRequests = new Map<string, FakeLeaveRequest>();

  const fake = {
    attendanceRecord: {
      findFirst: async ({
        where,
      }: {
        where: { organizationId: string; employeeId: string; status?: string };
      }) =>
        [...attendance.values()].find(
          (a) =>
            a.organizationId === where.organizationId &&
            a.employeeId === where.employeeId &&
            (where.status === undefined || a.status === where.status),
        ) ?? null,
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          employeeId: string;
          date: Date;
          clockInAt: Date;
          status: "ACTIVE";
        };
      }) => {
        const record: FakeAttendance = {
          id: nextId("attendance"),
          clockOutAt: null,
          totalMinutes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        attendance.set(record.id, record);
        return record;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeAttendance> }) => {
        const record = attendance.get(where.id);
        if (!record) throw new Error("attendance record not found");
        Object.assign(record, data, { updatedAt: new Date() });
        return record;
      },
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: { organizationId: string; employeeId?: string };
        skip?: number;
        take?: number;
      }) => {
        const list = [...attendance.values()]
          .filter(
            (a) =>
              a.organizationId === where.organizationId &&
              (where.employeeId === undefined || a.employeeId === where.employeeId),
          )
          .sort((a, b) => b.clockInAt.getTime() - a.clockInAt.getTime());
        return list.slice(skip, skip + take);
      },
      count: async ({ where }: { where: { organizationId: string; employeeId?: string } }) =>
        [...attendance.values()].filter(
          (a) =>
            a.organizationId === where.organizationId &&
            (where.employeeId === undefined || a.employeeId === where.employeeId),
        ).length,
    },
    leaveType: {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; organizationId_name?: { organizationId: string; name: string } };
      }) => {
        if (where.id) return leaveTypes.get(where.id) ?? null;
        if (where.organizationId_name) {
          const { organizationId, name } = where.organizationId_name;
          return (
            [...leaveTypes.values()].find(
              (lt) => lt.organizationId === organizationId && lt.name === name,
            ) ?? null
          );
        }
        return null;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...leaveTypes.values()].find(
          (lt) => lt.id === where.id && lt.organizationId === where.organizationId,
        ) ?? null,
      findMany: async ({ where }: { where: { organizationId: string } }) =>
        [...leaveTypes.values()]
          .filter((lt) => lt.organizationId === where.organizationId)
          .sort((a, b) => a.name.localeCompare(b.name)),
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          name: string;
          requiresBalance: boolean;
          defaultAnnualDays?: number;
          isPaid: boolean;
        };
      }) => {
        const leaveType: FakeLeaveType = {
          id: nextId("leavetype"),
          defaultAnnualDays: data.defaultAnnualDays ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        leaveTypes.set(leaveType.id, leaveType);
        return leaveType;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; organizationId: string };
        data: Partial<FakeLeaveType>;
      }) => {
        const leaveType = [...leaveTypes.values()].find(
          (lt) => lt.id === where.id && lt.organizationId === where.organizationId,
        );
        if (!leaveType) return { count: 0 };
        Object.assign(leaveType, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    leaveBalance: {
      upsert: async ({
        where,
        create,
      }: {
        where: {
          organizationId_employeeId_leaveTypeId_year: {
            organizationId: string;
            employeeId: string;
            leaveTypeId: string;
            year: number;
          };
        };
        create: {
          organizationId: string;
          employeeId: string;
          leaveTypeId: string;
          year: number;
          allocatedDays: number;
          usedDays: number;
        };
        update: Partial<FakeLeaveBalance>;
      }) => {
        const key = where.organizationId_employeeId_leaveTypeId_year;
        const existing = [...leaveBalances.values()].find(
          (b) =>
            b.organizationId === key.organizationId &&
            b.employeeId === key.employeeId &&
            b.leaveTypeId === key.leaveTypeId &&
            b.year === key.year,
        );
        if (existing) return existing;
        const balance: FakeLeaveBalance = {
          id: nextId("balance"),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        leaveBalances.set(balance.id, balance);
        return balance;
      },
      update: async ({
        where,
        data,
      }: {
        where: {
          organizationId_employeeId_leaveTypeId_year: {
            organizationId: string;
            employeeId: string;
            leaveTypeId: string;
            year: number;
          };
        };
        data: Partial<FakeLeaveBalance>;
      }) => {
        const key = where.organizationId_employeeId_leaveTypeId_year;
        const balance = [...leaveBalances.values()].find(
          (b) =>
            b.organizationId === key.organizationId &&
            b.employeeId === key.employeeId &&
            b.leaveTypeId === key.leaveTypeId &&
            b.year === key.year,
        );
        if (!balance) throw new Error("balance not found");
        Object.assign(balance, data, { updatedAt: new Date() });
        return balance;
      },
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; employeeId: string; year: number };
      }) =>
        [...leaveBalances.values()].filter(
          (b) =>
            b.organizationId === where.organizationId &&
            b.employeeId === where.employeeId &&
            b.year === where.year,
        ),
    },
    leaveRequest: {
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          employeeId: string;
          leaveTypeId: string;
          startDate: Date;
          endDate: Date;
          durationDays: number;
          reason: string;
          status: "PENDING";
        };
      }) => {
        const request: FakeLeaveRequest = {
          id: nextId("leaverequest"),
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        leaveRequests.set(request.id, request);
        return request;
      },
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          organizationId: string;
          employeeId?: string;
          status?: string;
          startDate?: { lte: Date };
          endDate?: { gte: Date };
        };
      }) =>
        [...leaveRequests.values()].find(
          (r) =>
            (where.id === undefined || r.id === where.id) &&
            r.organizationId === where.organizationId &&
            (where.employeeId === undefined || r.employeeId === where.employeeId) &&
            (where.status === undefined || r.status === where.status) &&
            (where.startDate === undefined ||
              r.startDate.getTime() <= where.startDate.lte.getTime()) &&
            (where.endDate === undefined || r.endDate.getTime() >= where.endDate.gte.getTime()),
        ) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeLeaveRequest>;
      }) => {
        const request = leaveRequests.get(where.id);
        if (!request) throw new Error("leave request not found");
        Object.assign(request, data, { updatedAt: new Date() });
        return request;
      },
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: { organizationId: string; employeeId?: string; status?: string };
        skip?: number;
        take?: number;
      }) => {
        const list = [...leaveRequests.values()]
          .filter(
            (r) =>
              r.organizationId === where.organizationId &&
              (where.employeeId === undefined || r.employeeId === where.employeeId) &&
              (where.status === undefined || r.status === where.status),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list.slice(skip, skip + take);
      },
      count: async ({
        where,
      }: {
        where: { organizationId: string; employeeId?: string; status?: string };
      }) =>
        [...leaveRequests.values()].filter(
          (r) =>
            r.organizationId === where.organizationId &&
            (where.employeeId === undefined || r.employeeId === where.employeeId) &&
            (where.status === undefined || r.status === where.status),
        ).length,
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };

  return fake as unknown as PrismaClient;
}
