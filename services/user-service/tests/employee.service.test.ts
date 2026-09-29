import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@nexora/http";
import { createEmployeeService } from "../src/services/employee.service.js";
import { createCapturingAuditClient } from "./fakeAuditClient.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG_A = "org_a";
const ACTOR = "user_actor";
const ORG_B = "org_b";

function baseInput(
  overrides: Partial<
    Parameters<ReturnType<typeof createEmployeeService>["createEmployee"]>[2]
  > = {},
) {
  return {
    employeeNumber: "EMP-001",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@acme.test",
    employmentType: "FULL_TIME" as const,
    hireDate: new Date("2024-01-15"),
    ...overrides,
  };
}

describe("createEmployee", () => {
  it("creates an employee scoped to the organization", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });

    const employee = await service.createEmployee(ORG_A, ACTOR, baseInput());
    expect(employee.organizationId).toBe(ORG_A);
    expect(employee.employeeNumber).toBe("EMP-001");
  });

  it("rejects a duplicate employee number within the same organization", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });

    await service.createEmployee(ORG_A, ACTOR, baseInput());
    await expect(
      service.createEmployee(ORG_A, ACTOR, baseInput({ email: "other@acme.test" })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows the same employee number across DIFFERENT organizations", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });

    await service.createEmployee(ORG_A, ACTOR, baseInput());
    const orgBEmployee = await service.createEmployee(
      ORG_B,
      ACTOR,
      baseInput({ email: "other@other-org.test" }),
    );
    expect(orgBEmployee.employeeNumber).toBe("EMP-001");
  });

  it("rejects a manager id that belongs to a different organization", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });

    const orgBManager = await service.createEmployee(
      ORG_B,
      ACTOR,
      baseInput({ email: "manager@other-org.test" }),
    );
    await expect(
      service.createEmployee(
        ORG_A,
        ACTOR,
        baseInput({ email: "report@acme.test", managerId: orgBManager.id }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listEmployees", () => {
  it("paginates and reports correct totals", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });

    for (let i = 1; i <= 5; i += 1) {
      await service.createEmployee(
        ORG_A,
        ACTOR,
        baseInput({ employeeNumber: `EMP-00${i}`, email: `person${i}@acme.test` }),
      );
    }

    const page1 = await service.listEmployees(ORG_A, { page: 1, pageSize: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
  });

  it("never returns another organization's employees", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });

    await service.createEmployee(ORG_A, ACTOR, baseInput());
    await service.createEmployee(ORG_B, ACTOR, baseInput({ email: "b@other-org.test" }));

    const result = await service.listEmployees(ORG_A, { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.organizationId).toBe(ORG_A);
  });

  it("filters by search term across name and email", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });

    await service.createEmployee(
      ORG_A,
      ACTOR,
      baseInput({ firstName: "Grace", lastName: "Hopper", email: "grace@acme.test" }),
    );
    await service.createEmployee(
      ORG_A,
      ACTOR,
      baseInput({
        employeeNumber: "EMP-002",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@acme.test",
      }),
    );

    const result = await service.listEmployees(ORG_A, { page: 1, pageSize: 20, search: "grace" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.firstName).toBe("Grace");
  });
});

describe("tenant isolation", () => {
  it("Org A cannot fetch, update, or deactivate Org B's employee by id", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });

    const orgBEmployee = await service.createEmployee(
      ORG_B,
      ACTOR,
      baseInput({ email: "b@other-org.test" }),
    );

    await expect(service.getEmployee(ORG_A, orgBEmployee.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.updateEmployee(ORG_A, ACTOR, orgBEmployee.id, { firstName: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.deactivateEmployee(ORG_A, ACTOR, orgBEmployee.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const stillIntact = await service.getEmployee(ORG_B, orgBEmployee.id);
    expect(stillIntact.firstName).toBe("Ada");
    expect(stillIntact.employmentStatus).toBe("ACTIVE");
  });
});

describe("updateEmployee and deactivateEmployee", () => {
  it("updates fields and rejects self-management", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });
    const employee = await service.createEmployee(ORG_A, ACTOR, baseInput());

    const updated = await service.updateEmployee(ORG_A, ACTOR, employee.id, {
      jobTitle: "Principal Engineer",
    });
    expect(updated.jobTitle).toBe("Principal Engineer");

    await expect(
      service.updateEmployee(ORG_A, ACTOR, employee.id, { managerId: employee.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("deactivation sets employmentStatus to TERMINATED rather than deleting the record", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });
    const employee = await service.createEmployee(ORG_A, ACTOR, baseInput());

    const deactivated = await service.deactivateEmployee(ORG_A, ACTOR, employee.id);
    expect(deactivated.employmentStatus).toBe("TERMINATED");

    // Still fetchable - a real record, not deleted.
    const stillThere = await service.getEmployee(ORG_A, employee.id);
    expect(stillThere.id).toBe(employee.id);
  });
});

describe("getStats", () => {
  it("counts total and active employees, scoped to the organization", async () => {
    const prisma = createFakePrisma();
    const service = createEmployeeService({ prisma, auditClient: createCapturingAuditClient() });
    await service.createEmployee(ORG_A, ACTOR, baseInput());
    const deactivated = await service.createEmployee(
      ORG_A,
      ACTOR,
      baseInput({ employeeNumber: "EMP-002", email: "b@acme.test" }),
    );
    await service.deactivateEmployee(ORG_A, ACTOR, deactivated.id);
    await service.createEmployee(ORG_B, ACTOR, baseInput({ email: "c@other-org.test" }));

    const stats = await service.getStats(ORG_A);
    expect(stats).toEqual({ totalEmployees: 2, activeEmployees: 1 });
  });
});

describe("audit logging", () => {
  it("records EMPLOYEE_CREATED, EMPLOYEE_UPDATED (field names only), and EMPLOYEE_DEACTIVATED", async () => {
    const prisma = createFakePrisma();
    const auditClient = createCapturingAuditClient();
    const service = createEmployeeService({ prisma, auditClient });

    const employee = await service.createEmployee(ORG_A, ACTOR, baseInput());
    expect(auditClient.entries[0]).toMatchObject({
      organizationId: ORG_A,
      actorId: ACTOR,
      action: "EMPLOYEE_CREATED",
      entityType: "employee",
      entityId: employee.id,
    });

    await service.updateEmployee(ORG_A, ACTOR, employee.id, { jobTitle: "Principal Engineer" });
    const updateEntry = auditClient.entries[1];
    expect(updateEntry).toMatchObject({ action: "EMPLOYEE_UPDATED", entityId: employee.id });
    // Field NAMES are recorded, not their values - the audit log must not
    // become a second copy of potentially sensitive employee data.
    expect(updateEntry?.metadata).toEqual({ changedFields: ["jobTitle"] });
    expect(JSON.stringify(updateEntry?.metadata)).not.toContain("Principal Engineer");

    await service.deactivateEmployee(ORG_A, ACTOR, employee.id);
    expect(auditClient.entries[2]).toMatchObject({
      action: "EMPLOYEE_DEACTIVATED",
      entityId: employee.id,
    });
  });

  it("does not record an audit entry when the operation fails", async () => {
    const prisma = createFakePrisma();
    const auditClient = createCapturingAuditClient();
    const service = createEmployeeService({ prisma, auditClient });

    await service.createEmployee(ORG_A, ACTOR, baseInput());
    auditClient.entries.length = 0;

    // Duplicate employee number - should throw before any audit call.
    await expect(
      service.createEmployee(ORG_A, ACTOR, baseInput({ email: "other@acme.test" })),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(auditClient.entries).toHaveLength(0);
  });
});
