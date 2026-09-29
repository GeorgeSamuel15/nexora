import { describe, expect, it } from "vitest";
import { createAuditService } from "../src/services/audit.service.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG = "org_1";

describe("recordEntry and listAuditLogs", () => {
  it("records an entry and lists it", async () => {
    const prisma = createFakePrisma();
    const service = createAuditService({ prisma });

    await service.recordEntry({
      organizationId: ORG,
      actorId: "user_1",
      action: "LOGIN",
      entityType: "session",
      entityId: "session_1",
      ipAddress: "203.0.113.5",
    });

    const result = await service.listAuditLogs(ORG, { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
    expect((result.data[0] as { action: string }).action).toBe("LOGIN");
  });

  it("filters by actorId, entityType/entityId, and action independently", async () => {
    const prisma = createFakePrisma();
    const service = createAuditService({ prisma });

    await service.recordEntry({
      organizationId: ORG,
      actorId: "user_1",
      action: "LOGIN",
      entityType: "session",
      entityId: "s1",
    });
    await service.recordEntry({
      organizationId: ORG,
      actorId: "user_2",
      action: "EMPLOYEE_UPDATED",
      entityType: "employee",
      entityId: "e1",
    });
    await service.recordEntry({
      organizationId: ORG,
      actorId: "user_1",
      action: "LOGOUT",
      entityType: "session",
      entityId: "s1",
    });

    expect(
      (await service.listAuditLogs(ORG, { page: 1, pageSize: 20, actorId: "user_1" })).data,
    ).toHaveLength(2);
    expect(
      (await service.listAuditLogs(ORG, { page: 1, pageSize: 20, entityType: "employee" })).data,
    ).toHaveLength(1);
    expect(
      (await service.listAuditLogs(ORG, { page: 1, pageSize: 20, entityId: "s1" })).data,
    ).toHaveLength(2);
    expect(
      (await service.listAuditLogs(ORG, { page: 1, pageSize: 20, action: "LOGOUT" })).data,
    ).toHaveLength(1);
  });

  it("defaults metadata to an empty object when none is given", async () => {
    const prisma = createFakePrisma();
    const service = createAuditService({ prisma });
    const entry = await service.recordEntry({
      organizationId: ORG,
      actorId: "user_1",
      action: "LOGIN",
      entityType: "session",
      entityId: "s1",
    });
    expect((entry as { metadata: unknown }).metadata).toEqual({});
  });
});

describe("tenant isolation", () => {
  it("never returns another organization's audit logs", async () => {
    const prisma = createFakePrisma();
    const service = createAuditService({ prisma });

    await service.recordEntry({
      organizationId: "org_a",
      actorId: "user_a",
      action: "LOGIN",
      entityType: "session",
      entityId: "s1",
    });
    await service.recordEntry({
      organizationId: "org_b",
      actorId: "user_b",
      action: "LOGIN",
      entityType: "session",
      entityId: "s2",
    });

    const result = await service.listAuditLogs("org_a", { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
  });
});
