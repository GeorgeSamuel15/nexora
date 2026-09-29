import { omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import type {
  CreateDepartmentInput,
  CreateTeamInput,
  UpdateDepartmentInput,
  UpdateTeamInput,
} from "../validation/structure.schemas.js";
export interface StructureServiceDeps {
  prisma: PrismaClient;
}
export function createStructureService(deps: StructureServiceDeps) {
  const { prisma } = deps;
  async function listDepartments(organizationId: string) {
    return prisma.department.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }
  async function createDepartment(organizationId: string, input: CreateDepartmentInput) {
    const existing = await prisma.department.findUnique({
      where: { organizationId_name: { organizationId, name: input.name } },
    });
    if (existing) {
      throw new ConflictError(`A department named "${input.name}" already exists.`);
    }
    return prisma.department.create({ data: omitUndefined({ organizationId, name: input.name }) });
  }
  async function updateDepartment(
    organizationId: string,
    departmentId: string,
    input: UpdateDepartmentInput,
  ) {
    // organizationId is part of the WHERE, not a post-fetch check - a
    // department id belonging to a different org simply doesn't match.
    const result = await prisma.department.updateMany({
      where: { id: departmentId, organizationId },
      data: omitUndefined({ name: input.name }),
    });
    if (result.count === 0) {
      throw new NotFoundError("Department");
    }
    return prisma.department.findUnique({ where: { id: departmentId } });
  }
  async function deleteDepartment(organizationId: string, departmentId: string) {
    const result = await prisma.department.deleteMany({
      where: { id: departmentId, organizationId },
    });
    if (result.count === 0) {
      throw new NotFoundError("Department");
    }
  }
  async function listTeams(organizationId: string) {
    return prisma.team.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }
  async function createTeam(organizationId: string, input: CreateTeamInput) {
    if (input.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: input.departmentId, organizationId },
      });
      if (!department) {
        throw new NotFoundError("Department");
      }
    }
    const existing = await prisma.team.findUnique({
      where: { organizationId_name: { organizationId, name: input.name } },
    });
    if (existing) {
      throw new ConflictError(`A team named "${input.name}" already exists.`);
    }
    return prisma.team.create({
      data: omitUndefined({ organizationId, name: input.name, departmentId: input.departmentId }),
    });
  }
  async function updateTeam(organizationId: string, teamId: string, input: UpdateTeamInput) {
    const team = await prisma.team.findFirst({ where: { id: teamId, organizationId } });
    if (!team) {
      throw new NotFoundError("Team");
    }
    if (input.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: input.departmentId, organizationId },
      });
      if (!department) {
        throw new NotFoundError("Department");
      }
    }
    return prisma.team.update({
      where: { id: teamId },
      data: omitUndefined({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      }),
    });
  }
  async function deleteTeam(organizationId: string, teamId: string) {
    const result = await prisma.team.deleteMany({ where: { id: teamId, organizationId } });
    if (result.count === 0) {
      throw new NotFoundError("Team");
    }
  }
  return {
    listDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    listTeams,
    createTeam,
    updateTeam,
    deleteTeam,
  };
}
export type StructureService = ReturnType<typeof createStructureService>;
