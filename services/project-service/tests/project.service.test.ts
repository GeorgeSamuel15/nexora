import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@nexora/http";
import { createProjectService } from "../src/services/project.service.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG = "org_1";
const OWNER = "user_owner";

describe("createProject", () => {
  it("creates a project and automatically adds the owner as a member", async () => {
    const prisma = createFakePrisma();
    const service = createProjectService({ prisma });

    const project = await service.createProject(ORG, {
      name: "Website Revamp",
      ownerId: OWNER,
      priority: "HIGH",
    });
    expect(project.status).toBe("PLANNING");

    const isMember = await service.isProjectMember(project.id, OWNER);
    expect(isMember).toBe(true);
  });
});

describe("progress computation", () => {
  it("reports 0% for a project with no tasks", async () => {
    const prisma = createFakePrisma();
    const service = createProjectService({ prisma });
    const project = await service.createProject(ORG, {
      name: "Empty",
      ownerId: OWNER,
      priority: "MEDIUM",
    });

    const fetched = await service.getProject(ORG, project.id);
    expect(fetched.progress).toEqual({ totalTasks: 0, completedTasks: 0, percentComplete: 0 });
  });

  it("excludes CANCELLED tasks from both totals", async () => {
    const prisma = createFakePrisma();
    const service = createProjectService({ prisma });
    const project = await service.createProject(ORG, {
      name: "P",
      ownerId: OWNER,
      priority: "MEDIUM",
    });

    await prisma.task.create({
      data: {
        organizationId: ORG,
        projectId: project.id,
        title: "t1",
        creatorId: OWNER,
        status: "COMPLETED",
      },
    });
    await prisma.task.create({
      data: {
        organizationId: ORG,
        projectId: project.id,
        title: "t2",
        creatorId: OWNER,
        status: "TODO",
      },
    });
    await prisma.task.create({
      data: {
        organizationId: ORG,
        projectId: project.id,
        title: "t3",
        creatorId: OWNER,
        status: "CANCELLED",
      },
    });

    const progress = await service.computeProgress(project.id);
    expect(progress).toEqual({ totalTasks: 2, completedTasks: 1, percentComplete: 50 });
  });
});

describe("membership management", () => {
  it("rejects adding a duplicate member", async () => {
    const prisma = createFakePrisma();
    const service = createProjectService({ prisma });
    const project = await service.createProject(ORG, {
      name: "P",
      ownerId: OWNER,
      priority: "MEDIUM",
    });

    await expect(service.addMember(ORG, project.id, { userId: OWNER })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("refuses to remove the project owner", async () => {
    const prisma = createFakePrisma();
    const service = createProjectService({ prisma });
    const project = await service.createProject(ORG, {
      name: "P",
      ownerId: OWNER,
      priority: "MEDIUM",
    });

    await expect(service.removeMember(ORG, project.id, OWNER)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("allows adding and removing a regular member", async () => {
    const prisma = createFakePrisma();
    const service = createProjectService({ prisma });
    const project = await service.createProject(ORG, {
      name: "P",
      ownerId: OWNER,
      priority: "MEDIUM",
    });

    await service.addMember(ORG, project.id, { userId: "user_2" });
    expect(await service.isProjectMember(project.id, "user_2")).toBe(true);

    await service.removeMember(ORG, project.id, "user_2");
    expect(await service.isProjectMember(project.id, "user_2")).toBe(false);
  });
});

describe("tenant isolation", () => {
  it("Org A cannot get, update, archive, or manage members of Org B's project", async () => {
    const prisma = createFakePrisma();
    const service = createProjectService({ prisma });
    const orgBProject = await service.createProject("org_b", {
      name: "Secret",
      ownerId: "org_b_owner",
      priority: "LOW",
    });

    await expect(service.getProject("org_a", orgBProject.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.updateProject("org_a", orgBProject.id, { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.archiveProject("org_a", orgBProject.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.listMembers("org_a", orgBProject.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      service.addMember("org_a", orgBProject.id, { userId: "intruder" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stillIntact = await service.getProject("org_b", orgBProject.id);
    expect(stillIntact.name).toBe("Secret");
  });

  it("listing projects never returns another org's rows", async () => {
    const prisma = createFakePrisma();
    const service = createProjectService({ prisma });
    await service.createProject("org_a", {
      name: "A project",
      ownerId: "user_a",
      priority: "MEDIUM",
    });
    await service.createProject("org_b", {
      name: "B project",
      ownerId: "user_b",
      priority: "MEDIUM",
    });

    const result = await service.listProjects("org_a", { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
  });
});

describe("getStats", () => {
  it("counts active projects and overdue/incomplete tasks, scoped to the organization", async () => {
    const prisma = createFakePrisma();
    const fixedNow = new Date("2026-03-15T00:00:00Z");
    const service = createProjectService({ prisma, now: () => fixedNow });

    const active = await service.createProject("org_a", {
      name: "Active",
      ownerId: "user_a",
      priority: "MEDIUM",
    });
    const planning = await service.createProject("org_a", {
      name: "Planning",
      ownerId: "user_a",
      priority: "MEDIUM",
    });
    await service.updateProject("org_a", active.id, { status: "ACTIVE" });
    void planning; // stays PLANNING - should not count as active

    await prisma.task.create({
      data: {
        organizationId: "org_a",
        projectId: active.id,
        title: "Overdue TODO",
        creatorId: "user_a",
        status: "TODO",
        dueDate: new Date("2026-03-01T00:00:00Z"), // past fixedNow
      },
    });
    await prisma.task.create({
      data: {
        organizationId: "org_a",
        projectId: active.id,
        title: "Future TODO",
        creatorId: "user_a",
        status: "TODO",
        dueDate: new Date("2026-04-01T00:00:00Z"), // future - not due yet
      },
    });
    await prisma.task.create({
      data: {
        organizationId: "org_a",
        projectId: active.id,
        title: "Overdue but done",
        creatorId: "user_a",
        status: "COMPLETED",
        dueDate: new Date("2026-03-01T00:00:00Z"), // past but completed - shouldn't count
      },
    });

    const stats = await service.getStats("org_a");
    expect(stats).toEqual({ activeProjects: 1, tasksDue: 1 });
  });
});
