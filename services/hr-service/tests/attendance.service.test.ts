import { describe, expect, it } from "vitest";
import { ConflictError } from "@nexora/http";
import { createAttendanceService } from "../src/services/attendance.service.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG = "org_1";
const EMPLOYEE = "user_1";

describe("clockIn / clockOut", () => {
  it("clocks in and then out, computing total minutes", async () => {
    const prisma = createFakePrisma();
    let currentTime = new Date("2026-01-10T09:00:00Z");
    const service = createAttendanceService({ prisma, now: () => currentTime });

    const clockedIn = await service.clockIn(ORG, EMPLOYEE);
    expect(clockedIn.status).toBe("ACTIVE");

    currentTime = new Date("2026-01-10T17:30:00Z");
    const clockedOut = await service.clockOut(ORG, EMPLOYEE);
    expect(clockedOut.status).toBe("COMPLETED");
    expect(clockedOut.totalMinutes).toBe(8 * 60 + 30);
  });

  it("refuses a second clock-in while already active", async () => {
    const prisma = createFakePrisma();
    const service = createAttendanceService({ prisma });

    await service.clockIn(ORG, EMPLOYEE);
    await expect(service.clockIn(ORG, EMPLOYEE)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to clock out when not clocked in", async () => {
    const prisma = createFakePrisma();
    const service = createAttendanceService({ prisma });

    await expect(service.clockOut(ORG, EMPLOYEE)).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows clocking in again after clocking out", async () => {
    const prisma = createFakePrisma();
    const service = createAttendanceService({ prisma });

    await service.clockIn(ORG, EMPLOYEE);
    await service.clockOut(ORG, EMPLOYEE);
    const secondClockIn = await service.clockIn(ORG, EMPLOYEE);
    expect(secondClockIn.status).toBe("ACTIVE");
  });

  it("each employee's active clock-in is independent", async () => {
    const prisma = createFakePrisma();
    const service = createAttendanceService({ prisma });

    await service.clockIn(ORG, "user_1");
    await service.clockIn(ORG, "user_2"); // must not conflict with user_1's active record

    await expect(service.clockOut(ORG, "user_1")).resolves.toBeDefined();
    await expect(service.clockOut(ORG, "user_2")).resolves.toBeDefined();
  });
});

describe("listAttendance", () => {
  it("never returns another organization's records", async () => {
    const prisma = createFakePrisma();
    const service = createAttendanceService({ prisma });

    await service.clockIn("org_a", "user_a");
    await service.clockIn("org_b", "user_b");

    const result = await service.listAttendance("org_a", { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });

  it("filters by employeeId", async () => {
    const prisma = createFakePrisma();
    const service = createAttendanceService({ prisma });

    await service.clockIn(ORG, "user_1");
    await service.clockIn(ORG, "user_2");

    const result = await service.listAttendance(ORG, {
      page: 1,
      pageSize: 20,
      employeeId: "user_1",
    });
    expect(result.data).toHaveLength(1);
  });
});
