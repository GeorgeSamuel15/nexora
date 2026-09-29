import { omitUndefined, toJsonObject } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import type { PaginatedResult } from "@nexora/types";
import type { AuditClient } from "@nexora/audit-client";
import type {
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from "../validation/employee.schemas.js";
export interface EmployeeServiceDeps {
  prisma: PrismaClient;
  auditClient: AuditClient;
}
// Minimal shape used only for the return type below - the real generated
// Prisma model has more fields, but this keeps the service's public
// surface typed without depending on Prisma's generated types directly.
export interface EmployeeRecord {
  id: string;
  organizationId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  employmentStatus: string;
  [key: string]: unknown;
}
export function createEmployeeService(deps: EmployeeServiceDeps) {
  const { prisma, auditClient } = deps;
  async function listEmployees(
    organizationId: string,
    query: ListEmployeesQuery,
  ): Promise<PaginatedResult<EmployeeRecord>> {
    const where = {
      organizationId,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.employmentStatus ? { employmentStatus: query.employmentStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" as const } },
              { lastName: { contains: query.search, mode: "insensitive" as const } },
              { email: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.employee.findMany({ where, skip, take, orderBy: { lastName: "asc" } }),
      prisma.employee.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function createEmployee(
    organizationId: string,
    actorId: string,
    input: CreateEmployeeInput,
  ): Promise<EmployeeRecord> {
    const existingNumber = await prisma.employee.findUnique({
      where: {
        organizationId_employeeNumber: { organizationId, employeeNumber: input.employeeNumber },
      },
    });
    if (existingNumber) {
      throw new ConflictError(`Employee number "${input.employeeNumber}" is already in use.`);
    }
    if (input.managerId) {
      const manager = await prisma.employee.findFirst({
        where: { id: input.managerId, organizationId },
      });
      if (!manager) {
        throw new NotFoundError("Manager");
      }
    }
    const employee = await prisma.employee.create({
      data: omitUndefined({ organizationId, ...input }),
    });
    await auditClient.record({
      organizationId,
      actorId,
      action: "EMPLOYEE_CREATED",
      entityType: "employee",
      entityId: employee.id,
      metadata: toJsonObject({ employeeNumber: employee.employeeNumber }),
    });
    return employee;
  }
  async function getEmployee(organizationId: string, employeeId: string): Promise<EmployeeRecord> {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, organizationId } });
    if (!employee) {
      throw new NotFoundError("Employee");
    }
    return employee;
  }
  async function updateEmployee(
    organizationId: string,
    actorId: string,
    employeeId: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeRecord> {
    await getEmployee(organizationId, employeeId); // 404s cleanly, scoped by org
    if (input.managerId) {
      if (input.managerId === employeeId) {
        throw new ConflictError("An employee cannot be their own manager.");
      }
      const manager = await prisma.employee.findFirst({
        where: { id: input.managerId, organizationId },
      });
      if (!manager) {
        throw new NotFoundError("Manager");
      }
    }
    const employee = await prisma.employee.update({
      where: { id: employeeId },
      data: omitUndefined(input),
    });
    await auditClient.record({
      organizationId,
      actorId,
      action: "EMPLOYEE_UPDATED",
      entityType: "employee",
      entityId: employeeId,
      // Which fields changed, not their values - an audit log shouldn't
      // become a second copy of potentially sensitive employee data.
      metadata: toJsonObject({ changedFields: Object.keys(input) }),
    });
    return employee;
  }
  /** "Deactivation" per the build spec is a status change, not a hard
   * delete - employment history (past attendance, completed tasks, ...)
   * must stay attributable to a real employee record. */
  async function deactivateEmployee(
    organizationId: string,
    actorId: string,
    employeeId: string,
  ): Promise<EmployeeRecord> {
    await getEmployee(organizationId, employeeId);
    const employee = await prisma.employee.update({
      where: { id: employeeId },
      data: omitUndefined({ employmentStatus: "TERMINATED" }),
    });
    await auditClient.record({
      organizationId,
      actorId,
      action: "EMPLOYEE_DEACTIVATED",
      entityType: "employee",
      entityId: employeeId,
    });
    return employee;
  }
  /** Backs analytics-service's dashboard aggregation (Phase 11) - a
   * real count, not a hardcoded number. */
  async function getStats(organizationId: string) {
    const [totalEmployees, activeEmployees] = await Promise.all([
      prisma.employee.count({ where: { organizationId } }),
      prisma.employee.count({ where: { organizationId, employmentStatus: "ACTIVE" } }),
    ]);
    return { totalEmployees, activeEmployees };
  }
  return {
    listEmployees,
    createEmployee,
    getEmployee,
    updateEmployee,
    deactivateEmployee,
    getStats,
  };
}
export type EmployeeService = ReturnType<typeof createEmployeeService>;
