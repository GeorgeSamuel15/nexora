import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@nexora/http";
import { createProjectService } from "../src/services/project.service.js";
import { createTaskService } from "../src/services/task.service.js";
import { createFakePrisma } from "./fakePrisma.js";
import { createCapturingPublisher } from "./fakeEventPublisher.js";

const ORG = "org_1";
const OWNER = "user_owner";

async function setupProject(prisma: ReturnType<typeof createFakePrisma>) {
  const projectService = createProjectService({ prisma });
  const eventPublisher = createCapturingPublisher();
  const taskService = createTaskService({ prisma, projectService, eventPublisher });
  const project = await projectService.createProject(ORG, {
    name: "Website",
    ownerId: OWNER,
    priority: "MEDIUM",
  });
  return { projectService, taskService, eventPublisher, project };
}

describe("createTask", () => {
  it("creates a task and logs a CREATED activity entry", async () => {
    const prisma = createFakePrisma();
    const { taskService, project } = await setupProject(prisma);

    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Design homepage",
      priority: "HIGH",
    });
    expect(task.status).toBe("TODO");

    const activity = await taskService.listActivity(ORG, task.id);
    expect(activity.map((a: { action: string }) => a.action)).toContain("CREATED");
  });

  it("refuses to assign a task to someone who isn't a project member", async () => {
    const prisma = createFakePrisma();
    const { taskService, project } = await setupProject(prisma);

    await expect(
      taskService.createTask(ORG, OWNER, {
        projectId: project.id,
        title: "Task",
        priority: "MEDIUM",
        assigneeId: "not_a_member",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows assigning to the project owner (auto-member) or an added member", async () => {
    const prisma = createFakePrisma();
    const { projectService, taskService, project } = await setupProject(prisma);
    await projectService.addMember(ORG, project.id, { userId: "user_2" });

    await expect(
      taskService.createTask(ORG, OWNER, {
        projectId: project.id,
        title: "For owner",
        priority: "MEDIUM",
        assigneeId: OWNER,
      }),
    ).resolves.toBeDefined();
    await expect(
      taskService.createTask(ORG, OWNER, {
        projectId: project.id,
        title: "For member",
        priority: "MEDIUM",
        assigneeId: "user_2",
      }),
    ).resolves.toBeDefined();
  });

  it("rejects creating a task for a project in a different organization", async () => {
    const prisma = createFakePrisma();
    const { taskService, project } = await setupProject(prisma);

    await expect(
      taskService.createTask("org_other", OWNER, {
        projectId: project.id,
        title: "Cross-org",
        priority: "MEDIUM",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("assignTask", () => {
  it("reassigns and logs activity, enforcing membership", async () => {
    const prisma = createFakePrisma();
    const { projectService, taskService, project } = await setupProject(prisma);
    await projectService.addMember(ORG, project.id, { userId: "user_2" });
    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Task",
      priority: "MEDIUM",
    });

    const assigned = await taskService.assignTask(ORG, task.id, OWNER, { assigneeId: "user_2" });
    expect(assigned.assigneeId).toBe("user_2");

    await expect(
      taskService.assignTask(ORG, task.id, OWNER, { assigneeId: "not_a_member" }),
    ).rejects.toBeInstanceOf(ConflictError);

    const activity = await taskService.listActivity(ORG, task.id);
    expect(activity.some((a: { action: string }) => a.action === "ASSIGNED")).toBe(true);
  });

  it("allows unassigning (null assignee)", async () => {
    const prisma = createFakePrisma();
    const { taskService, project } = await setupProject(prisma);
    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Task",
      priority: "MEDIUM",
      assigneeId: OWNER,
    });

    const unassigned = await taskService.assignTask(ORG, task.id, OWNER, { assigneeId: null });
    expect(unassigned.assigneeId).toBeNull();
  });
});

describe("completeTask", () => {
  it("marks a task COMPLETED and logs a STATUS_CHANGED activity", async () => {
    const prisma = createFakePrisma();
    const { taskService, project } = await setupProject(prisma);
    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Task",
      priority: "MEDIUM",
    });

    const completed = await taskService.completeTask(ORG, task.id, OWNER);
    expect(completed.status).toBe("COMPLETED");

    const activity = await taskService.listActivity(ORG, task.id);
    expect(activity.some((a: { action: string }) => a.action === "STATUS_CHANGED")).toBe(true);
  });

  it("refuses to complete an already-completed task", async () => {
    const prisma = createFakePrisma();
    const { taskService, project } = await setupProject(prisma);
    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Task",
      priority: "MEDIUM",
    });
    await taskService.completeTask(ORG, task.id, OWNER);

    await expect(taskService.completeTask(ORG, task.id, OWNER)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("refuses to complete a cancelled task", async () => {
    const prisma = createFakePrisma();
    const { taskService, project } = await setupProject(prisma);
    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Task",
      priority: "MEDIUM",
    });
    await taskService.updateTask(ORG, task.id, OWNER, { status: "CANCELLED" });

    await expect(taskService.completeTask(ORG, task.id, OWNER)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("reflects completion in the project's progress", async () => {
    const prisma = createFakePrisma();
    const { projectService, taskService, project } = await setupProject(prisma);
    const t1 = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "t1",
      priority: "MEDIUM",
    });
    await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "t2",
      priority: "MEDIUM",
    });
    await taskService.completeTask(ORG, t1.id, OWNER);

    const progress = await projectService.computeProgress(project.id);
    expect(progress).toEqual({ totalTasks: 2, completedTasks: 1, percentComplete: 50 });
  });
});

describe("comments and activity", () => {
  it("adding a comment logs a COMMENTED activity entry", async () => {
    const prisma = createFakePrisma();
    const { taskService, project } = await setupProject(prisma);
    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Task",
      priority: "MEDIUM",
    });

    const comment = await taskService.addComment(ORG, task.id, OWNER, {
      content: "Looks good so far",
    });
    expect(comment.content).toBe("Looks good so far");

    const activity = await taskService.listActivity(ORG, task.id);
    expect(activity.some((a: { action: string }) => a.action === "COMMENTED")).toBe(true);
  });
});

describe("event publishing", () => {
  it("publishes TASK_ASSIGNED when a task is created with an assignee", async () => {
    const prisma = createFakePrisma();
    const { taskService, eventPublisher, project } = await setupProject(prisma);

    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Design homepage",
      priority: "MEDIUM",
      assigneeId: OWNER,
    });

    expect(eventPublisher.events).toHaveLength(1);
    expect(eventPublisher.events[0]?.type).toBe("TASK_ASSIGNED");
    expect(eventPublisher.events[0]?.payload).toMatchObject({
      taskId: task.id,
      assigneeId: OWNER,
      assignedBy: OWNER,
    });
  });

  it("does not publish TASK_ASSIGNED when a task is created without an assignee", async () => {
    const prisma = createFakePrisma();
    const { taskService, eventPublisher, project } = await setupProject(prisma);
    await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Unassigned task",
      priority: "MEDIUM",
    });
    expect(eventPublisher.events).toHaveLength(0);
  });

  it("publishes TASK_ASSIGNED on reassignment but not on unassignment", async () => {
    const prisma = createFakePrisma();
    const { projectService, taskService, eventPublisher, project } = await setupProject(prisma);
    await projectService.addMember(ORG, project.id, { userId: "user_2" });
    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Task",
      priority: "MEDIUM",
    });

    await taskService.assignTask(ORG, task.id, OWNER, { assigneeId: "user_2" });
    expect(eventPublisher.events).toHaveLength(1);
    expect(eventPublisher.events[0]?.type).toBe("TASK_ASSIGNED");

    await taskService.assignTask(ORG, task.id, OWNER, { assigneeId: null });
    expect(eventPublisher.events).toHaveLength(1); // still 1 - unassigning doesn't publish TASK_ASSIGNED
  });

  it("publishes TASK_COMPLETED when a task is completed", async () => {
    const prisma = createFakePrisma();
    const { taskService, eventPublisher, project } = await setupProject(prisma);
    const task = await taskService.createTask(ORG, OWNER, {
      projectId: project.id,
      title: "Task",
      priority: "MEDIUM",
    });

    await taskService.completeTask(ORG, task.id, OWNER);
    const completedEvent = eventPublisher.events.find((e) => e.type === "TASK_COMPLETED");
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.payload).toMatchObject({ taskId: task.id, completedBy: OWNER });
  });
});

describe("tenant isolation", () => {
  it("Org A cannot get, update, assign, complete, or comment on Org B's task", async () => {
    const prisma = createFakePrisma();
    const projectService = createProjectService({ prisma });
    const taskService = createTaskService({
      prisma,
      projectService,
      eventPublisher: createCapturingPublisher(),
    });
    const orgBProject = await projectService.createProject("org_b", {
      name: "P",
      ownerId: "org_b_owner",
      priority: "MEDIUM",
    });
    const orgBTask = await taskService.createTask("org_b", "org_b_owner", {
      projectId: orgBProject.id,
      title: "Secret task",
      priority: "MEDIUM",
    });

    await expect(taskService.getTaskOrThrow("org_a", orgBTask.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      taskService.updateTask("org_a", orgBTask.id, "intruder", { title: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      taskService.assignTask("org_a", orgBTask.id, "intruder", { assigneeId: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(taskService.completeTask("org_a", orgBTask.id, "intruder")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      taskService.addComment("org_a", orgBTask.id, "intruder", { content: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stillIntact = await taskService.getTaskOrThrow("org_b", orgBTask.id);
    expect(stillIntact.title).toBe("Secret task");
    expect(stillIntact.status).toBe("TODO");
  });
});
