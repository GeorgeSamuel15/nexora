import type { PrismaClient } from "../generated/client/index.js";

interface FakeProject {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  ownerId: string;
  status: string;
  priority: string;
  startDate: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeProjectMember {
  id: string;
  projectId: string;
  userId: string;
  addedAt: Date;
}

interface FakeTask {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  creatorId: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeComment {
  id: string;
  organizationId: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeActivity {
  id: string;
  organizationId: string;
  taskId: string;
  actorId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createFakePrisma() {
  const projects = new Map<string, FakeProject>();
  const members = new Map<string, FakeProjectMember>();
  const tasks = new Map<string, FakeTask>();
  const comments = new Map<string, FakeComment>();
  const activities = new Map<string, FakeActivity>();

  const fake = {
    project: {
      create: async ({
        data,
      }: {
        data: Pick<FakeProject, "organizationId" | "name" | "ownerId"> & Partial<FakeProject>;
      }) => {
        const project: FakeProject = {
          id: nextId("project"),
          description: null,
          status: "PLANNING",
          priority: "MEDIUM",
          startDate: null,
          dueDate: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        projects.set(project.id, project);
        return project;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...projects.values()].find(
          (p) => p.id === where.id && p.organizationId === where.organizationId,
        ) ?? null,
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: { organizationId: string; status?: string };
        skip?: number;
        take?: number;
      }) => {
        const list = [...projects.values()]
          .filter(
            (p) =>
              p.organizationId === where.organizationId &&
              (where.status === undefined || p.status === where.status),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list.slice(skip, skip + take);
      },
      count: async ({ where }: { where: { organizationId: string; status?: string } }) =>
        [...projects.values()].filter(
          (p) =>
            p.organizationId === where.organizationId &&
            (where.status === undefined || p.status === where.status),
        ).length,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; organizationId: string };
        data: Partial<FakeProject>;
      }) => {
        const project = [...projects.values()].find(
          (p) => p.id === where.id && p.organizationId === where.organizationId,
        );
        if (!project) return { count: 0 };
        Object.assign(project, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    projectMember: {
      create: async ({ data }: { data: { projectId: string; userId: string } }) => {
        const member: FakeProjectMember = { id: nextId("member"), addedAt: new Date(), ...data };
        members.set(member.id, member);
        return member;
      },
      findUnique: async ({
        where,
      }: {
        where: { projectId_userId: { projectId: string; userId: string } };
      }) =>
        [...members.values()].find(
          (m) =>
            m.projectId === where.projectId_userId.projectId &&
            m.userId === where.projectId_userId.userId,
        ) ?? null,
      findMany: async ({ where }: { where: { projectId: string } }) =>
        [...members.values()]
          .filter((m) => m.projectId === where.projectId)
          .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime()),
      deleteMany: async ({ where }: { where: { projectId: string; userId: string } }) => {
        const member = [...members.values()].find(
          (m) => m.projectId === where.projectId && m.userId === where.userId,
        );
        if (!member) return { count: 0 };
        members.delete(member.id);
        return { count: 1 };
      },
    },
    task: {
      create: async ({
        data,
      }: {
        data: Pick<FakeTask, "organizationId" | "projectId" | "title" | "creatorId"> &
          Partial<FakeTask>;
      }) => {
        const task: FakeTask = {
          id: nextId("task"),
          description: null,
          assigneeId: null,
          priority: "MEDIUM",
          status: "TODO",
          dueDate: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        tasks.set(task.id, task);
        return task;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...tasks.values()].find(
          (t) => t.id === where.id && t.organizationId === where.organizationId,
        ) ?? null,
      findMany: async ({
        where,
        skip = 0,
        take = 20,
        orderBy,
      }: {
        where: {
          organizationId: string;
          projectId?: string;
          assigneeId?: string;
          status?: string;
          priority?: string;
        };
        skip?: number;
        take?: number;
        orderBy?: Record<string, "asc" | "desc">;
      }) => {
        let list = [...tasks.values()].filter(
          (t) =>
            t.organizationId === where.organizationId &&
            (where.projectId === undefined || t.projectId === where.projectId) &&
            (where.assigneeId === undefined || t.assigneeId === where.assigneeId) &&
            (where.status === undefined || t.status === where.status) &&
            (where.priority === undefined || t.priority === where.priority),
        );
        if (orderBy) {
          const [key, direction] = Object.entries(orderBy)[0] ?? ["createdAt", "desc"];
          list = list.sort((a, b) => {
            const av = (a as unknown as Record<string, unknown>)[key];
            const bv = (b as unknown as Record<string, unknown>)[key];
            const cmp =
              av instanceof Date && bv instanceof Date
                ? av.getTime() - bv.getTime()
                : String(av).localeCompare(String(bv));
            return direction === "asc" ? cmp : -cmp;
          });
        }
        return list.slice(skip, skip + take);
      },
      count: async ({
        where,
      }: {
        where: {
          organizationId?: string;
          projectId?: string;
          status?: string | { not: string } | { notIn: string[] };
          dueDate?: { lte: Date };
        };
      }) =>
        [...tasks.values()].filter((t) => {
          if (where.organizationId !== undefined && t.organizationId !== where.organizationId)
            return false;
          if (where.projectId !== undefined && t.projectId !== where.projectId) return false;
          if (where.status !== undefined) {
            if (typeof where.status === "string") {
              if (t.status !== where.status) return false;
            } else if ("not" in where.status) {
              if (t.status === where.status.not) return false;
            } else if ("notIn" in where.status) {
              if (where.status.notIn.includes(t.status)) return false;
            }
          }
          if (where.dueDate !== undefined) {
            if (!t.dueDate || t.dueDate.getTime() > where.dueDate.lte.getTime()) return false;
          }
          return true;
        }).length,
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeTask> }) => {
        const task = tasks.get(where.id);
        if (!task) throw new Error("task not found");
        Object.assign(task, data, { updatedAt: new Date() });
        return task;
      },
    },
    taskComment: {
      create: async ({
        data,
      }: {
        data: { organizationId: string; taskId: string; authorId: string; content: string };
      }) => {
        const comment: FakeComment = {
          id: nextId("comment"),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        comments.set(comment.id, comment);
        return comment;
      },
      findMany: async ({ where }: { where: { taskId: string } }) =>
        [...comments.values()]
          .filter((c) => c.taskId === where.taskId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    },
    taskActivity: {
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          taskId: string;
          actorId: string;
          action: string;
          metadata: Record<string, unknown>;
        };
      }) => {
        const activity: FakeActivity = { id: nextId("activity"), createdAt: new Date(), ...data };
        activities.set(activity.id, activity);
        return activity;
      },
      findMany: async ({ where }: { where: { taskId: string } }) =>
        [...activities.values()]
          .filter((a) => a.taskId === where.taskId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    },
  };

  return fake as unknown as PrismaClient;
}
