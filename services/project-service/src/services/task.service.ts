import { toJsonObject, omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import {
  buildEvent,
  type EventPublisher,
  type TaskAssignedEvent,
  type TaskCompletedEvent,
} from "@nexora/events";
import type { PaginatedResult } from "@nexora/types";
import type { ProjectService } from "./project.service.js";
import type {
  AssignTaskInput,
  CreateCommentInput,
  CreateTaskInput,
  ListTasksQuery,
  UpdateTaskInput,
} from "../validation/task.schemas.js";
export interface TaskServiceDeps {
  prisma: PrismaClient;
  projectService: ProjectService;
  eventPublisher: EventPublisher;
}
export function createTaskService(deps: TaskServiceDeps) {
  const { prisma, projectService, eventPublisher } = deps;
  async function logActivity(
    organizationId: string,
    taskId: string,
    actorId: string,
    action: string,
    metadata: Record<string, unknown> = {},
  ) {
    await prisma.taskActivity.create({
      data: omitUndefined({
        organizationId,
        taskId,
        actorId,
        action,
        metadata: toJsonObject(metadata),
      }),
    });
  }
  /** Assignment is gated on project membership so "project members" is a
   * meaningful concept, not just a list nobody checks - the project owner
   * counts as a member automatically (see project.service.ts). */
  async function assertAssignable(projectId: string, assigneeId: string) {
    const isMember = await projectService.isProjectMember(projectId, assigneeId);
    if (!isMember) {
      throw new ConflictError("Tasks can only be assigned to a project member.");
    }
  }
  async function createTask(organizationId: string, creatorId: string, input: CreateTaskInput) {
    await projectService.assertProjectInOrg(organizationId, input.projectId);
    if (input.assigneeId) {
      await assertAssignable(input.projectId, input.assigneeId);
    }
    const task = await prisma.task.create({
      data: omitUndefined({
        organizationId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        assigneeId: input.assigneeId,
        creatorId,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : undefined,
      }),
    });
    await logActivity(organizationId, task.id, creatorId, "CREATED", { title: task.title });
    if (input.assigneeId) {
      await logActivity(organizationId, task.id, creatorId, "ASSIGNED", {
        assigneeId: input.assigneeId,
      });
      await eventPublisher.publish(
        buildEvent<TaskAssignedEvent>("TASK_ASSIGNED", organizationId, {
          taskId: task.id,
          taskTitle: task.title,
          assigneeId: input.assigneeId,
          assignedBy: creatorId,
        }),
      );
    }
    return task;
  }
  async function getTaskOrThrow(organizationId: string, taskId: string) {
    const task = await prisma.task.findFirst({ where: { id: taskId, organizationId } });
    if (!task) {
      throw new NotFoundError("Task");
    }
    return task;
  }
  async function listTasks(
    organizationId: string,
    query: ListTasksQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.task.findMany({ where, skip, take, orderBy: { [query.sortBy]: query.sortOrder } }),
      prisma.task.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function updateTask(
    organizationId: string,
    taskId: string,
    actorId: string,
    input: UpdateTaskInput,
  ) {
    const task = await getTaskOrThrow(organizationId, taskId);
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: omitUndefined({
        ...input,
        dueDate:
          input.dueDate === undefined
            ? undefined
            : input.dueDate
              ? new Date(`${input.dueDate}T00:00:00Z`)
              : null,
      }),
    });
    if (input.status && input.status !== task.status) {
      await logActivity(organizationId, task.id, actorId, "STATUS_CHANGED", {
        from: task.status,
        to: input.status,
      });
    }
    if (Object.keys(input).some((key) => key !== "status")) {
      await logActivity(organizationId, task.id, actorId, "UPDATED", {
        fields: Object.keys(input),
      });
    }
    return updated;
  }
  async function assignTask(
    organizationId: string,
    taskId: string,
    actorId: string,
    input: AssignTaskInput,
  ) {
    const task = await getTaskOrThrow(organizationId, taskId);
    if (input.assigneeId) {
      await assertAssignable(task.projectId, input.assigneeId);
    }
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: omitUndefined({ assigneeId: input.assigneeId }),
    });
    await logActivity(
      organizationId,
      task.id,
      actorId,
      input.assigneeId ? "ASSIGNED" : "UNASSIGNED",
      {
        assigneeId: input.assigneeId,
      },
    );
    if (input.assigneeId) {
      await eventPublisher.publish(
        buildEvent<TaskAssignedEvent>("TASK_ASSIGNED", organizationId, {
          taskId: task.id,
          taskTitle: task.title,
          assigneeId: input.assigneeId,
          assignedBy: actorId,
        }),
      );
    }
    return updated;
  }
  async function completeTask(organizationId: string, taskId: string, actorId: string) {
    const task = await getTaskOrThrow(organizationId, taskId);
    if (task.status === "COMPLETED") {
      throw new ConflictError("This task is already completed.");
    }
    if (task.status === "CANCELLED") {
      throw new ConflictError("A cancelled task cannot be completed.");
    }
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: omitUndefined({ status: "COMPLETED" }),
    });
    await logActivity(organizationId, task.id, actorId, "STATUS_CHANGED", {
      from: task.status,
      to: "COMPLETED",
    });
    await eventPublisher.publish(
      buildEvent<TaskCompletedEvent>("TASK_COMPLETED", organizationId, {
        taskId: task.id,
        taskTitle: task.title,
        completedBy: actorId,
      }),
    );
    return updated;
  }
  async function addComment(
    organizationId: string,
    taskId: string,
    authorId: string,
    input: CreateCommentInput,
  ) {
    await getTaskOrThrow(organizationId, taskId);
    const comment = await prisma.taskComment.create({
      data: omitUndefined({ organizationId, taskId, authorId, content: input.content }),
    });
    await logActivity(organizationId, taskId, authorId, "COMMENTED", { commentId: comment.id });
    return comment;
  }
  async function listComments(organizationId: string, taskId: string) {
    await getTaskOrThrow(organizationId, taskId);
    return prisma.taskComment.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });
  }
  async function listActivity(organizationId: string, taskId: string) {
    await getTaskOrThrow(organizationId, taskId);
    return prisma.taskActivity.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });
  }
  return {
    createTask,
    getTaskOrThrow,
    listTasks,
    updateTask,
    assignTask,
    completeTask,
    addComment,
    listComments,
    listActivity,
  };
}
export type TaskService = ReturnType<typeof createTaskService>;
