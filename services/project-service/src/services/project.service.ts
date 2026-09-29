import { omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import type { PaginatedResult } from "@nexora/types";
import type {
  AddProjectMemberInput,
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from "../validation/project.schemas.js";
export interface ProjectServiceDeps {
  prisma: PrismaClient;
  now?: () => Date;
}
export interface ProjectProgress {
  totalTasks: number;
  completedTasks: number;
  /** 0-100, rounded. CANCELLED tasks are excluded from both counts - they
   * don't represent remaining work, so counting them against the project
   * would understate progress on a project that correctly cancelled
   * some no-longer-needed tasks. */
  percentComplete: number;
}
export function createProjectService(deps: ProjectServiceDeps) {
  const { prisma } = deps;
  const now = deps.now ?? (() => new Date());
  async function computeProgress(projectId: string): Promise<ProjectProgress> {
    const [totalTasks, completedTasks] = await Promise.all([
      prisma.task.count({ where: { projectId, status: { not: "CANCELLED" } } }),
      prisma.task.count({ where: { projectId, status: "COMPLETED" } }),
    ]);
    const percentComplete = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
    return { totalTasks, completedTasks, percentComplete };
  }
  async function createProject(organizationId: string, input: CreateProjectInput) {
    const project = await prisma.project.create({
      data: omitUndefined({
        organizationId,
        name: input.name,
        description: input.description,
        ownerId: input.ownerId,
        priority: input.priority,
        startDate: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : undefined,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : undefined,
      }),
    });
    // The owner is automatically a project member - they need to be
    // assignable to their own project's tasks without a separate step.
    await prisma.projectMember.create({
      data: omitUndefined({ projectId: project.id, userId: input.ownerId }),
    });
    return project;
  }
  async function listProjects(
    organizationId: string,
    query: ListProjectsQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [projects, total] = await Promise.all([
      prisma.project.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.project.count({ where }),
    ]);
    const data = await Promise.all(
      projects.map(async (project: { id: string }) => ({
        ...project,
        progress: await computeProgress(project.id),
      })),
    );
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function getProject(organizationId: string, projectId: string) {
    const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project) {
      throw new NotFoundError("Project");
    }
    const progress = await computeProgress(projectId);
    return { ...project, progress };
  }
  async function updateProject(
    organizationId: string,
    projectId: string,
    input: UpdateProjectInput,
  ) {
    const result = await prisma.project.updateMany({
      where: { id: projectId, organizationId },
      data: omitUndefined({
        ...input,
        startDate:
          input.startDate === undefined
            ? undefined
            : input.startDate
              ? new Date(`${input.startDate}T00:00:00Z`)
              : null,
        dueDate:
          input.dueDate === undefined
            ? undefined
            : input.dueDate
              ? new Date(`${input.dueDate}T00:00:00Z`)
              : null,
      }),
    });
    if (result.count === 0) {
      throw new NotFoundError("Project");
    }
    return getProject(organizationId, projectId);
  }
  /** "Delete" is a status change to ARCHIVED, not a hard delete - tasks,
   * comments, and activity history must survive for audit purposes. */
  async function archiveProject(organizationId: string, projectId: string) {
    const result = await prisma.project.updateMany({
      where: { id: projectId, organizationId },
      data: omitUndefined({ status: "ARCHIVED" }),
    });
    if (result.count === 0) {
      throw new NotFoundError("Project");
    }
    return getProject(organizationId, projectId);
  }
  async function listMembers(organizationId: string, projectId: string) {
    await assertProjectInOrg(organizationId, projectId);
    return prisma.projectMember.findMany({ where: { projectId }, orderBy: { addedAt: "asc" } });
  }
  async function addMember(
    organizationId: string,
    projectId: string,
    input: AddProjectMemberInput,
  ) {
    await assertProjectInOrg(organizationId, projectId);
    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: input.userId } },
    });
    if (existing) {
      throw new ConflictError("This user is already a project member.");
    }
    return prisma.projectMember.create({
      data: omitUndefined({ projectId, userId: input.userId }),
    });
  }
  async function removeMember(organizationId: string, projectId: string, userId: string) {
    const project = await assertProjectInOrg(organizationId, projectId);
    if (project.ownerId === userId) {
      throw new ConflictError("The project owner cannot be removed as a member.");
    }
    const result = await prisma.projectMember.deleteMany({ where: { projectId, userId } });
    if (result.count === 0) {
      throw new NotFoundError("Project member");
    }
  }
  async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return membership !== null;
  }
  async function assertProjectInOrg(organizationId: string, projectId: string) {
    const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project) {
      throw new NotFoundError("Project");
    }
    return project;
  }
  /** Backs analytics-service's dashboard aggregation (Phase 11). Both
   * counts are real queries against this service's own tables (Project
   * and Task share a database here). */
  async function getStats(organizationId: string) {
    const [activeProjects, tasksDue] = await Promise.all([
      prisma.project.count({ where: { organizationId, status: "ACTIVE" } }),
      prisma.task.count({
        where: {
          organizationId,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          dueDate: { lte: now() },
        },
      }),
    ]);
    return { activeProjects, tasksDue };
  }
  return {
    createProject,
    listProjects,
    getProject,
    updateProject,
    archiveProject,
    listMembers,
    addMember,
    removeMember,
    isProjectMember,
    assertProjectInOrg,
    computeProgress,
    getStats,
  };
}
export type ProjectService = ReturnType<typeof createProjectService>;
