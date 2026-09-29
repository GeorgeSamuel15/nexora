import { describe, expect, it, vi } from "vitest";
import type { Permission } from "@nexora/types";
import { createDashboardService } from "../src/services/dashboard.service.js";
import { StatsUnavailableError } from "../src/clients/statsClient.js";
import type { StatsClients } from "../src/clients/statsClients.js";

const ORG = "org_1";

function fakeClients(overrides: Partial<StatsClients> = {}): StatsClients {
  return {
    getEmployeeStats: vi.fn(async () => ({ totalEmployees: 10, activeEmployees: 9 })),
    getLeaveStats: vi.fn(async () => ({ pendingLeaveRequests: 2 })),
    getProjectStats: vi.fn(async () => ({ activeProjects: 4, tasksDue: 3 })),
    getCrmStats: vi.fn(async () => ({ openDeals: 5 })),
    getFinanceStats: vi.fn(async () => ({
      revenue: 10000,
      outstandingInvoicesCount: 2,
      outstandingAmount: 500,
      totalExpenses: 300,
    })),
    ...overrides,
  };
}

const ALL_PERMISSIONS: Permission[] = [
  "employee.read",
  "leave.read",
  "project.read",
  "crm.read",
  "finance.read",
];

describe("getDashboardSummary", () => {
  it("includes every section when the caller has every relevant permission", async () => {
    const clients = fakeClients();
    const service = createDashboardService({ statsClients: clients });

    const summary = await service.getDashboardSummary(ORG, ALL_PERMISSIONS);

    expect(summary.employees).toEqual({ totalEmployees: 10, activeEmployees: 9 });
    expect(summary.hr).toEqual({ pendingLeaveRequests: 2 });
    expect(summary.projects).toEqual({ activeProjects: 4, tasksDue: 3 });
    expect(summary.crm).toEqual({ openDeals: 5 });
    expect(summary.finance).toBeDefined();
    expect(summary.unavailableSections).toHaveLength(0);
  });

  it("omits sections the caller lacks permission for, and never even calls their client", async () => {
    const clients = fakeClients();
    const service = createDashboardService({ statsClients: clients });

    const summary = await service.getDashboardSummary(ORG, ["employee.read"]);

    expect(summary.employees).toBeDefined();
    expect(summary.hr).toBeUndefined();
    expect(summary.projects).toBeUndefined();
    expect(summary.crm).toBeUndefined();
    expect(summary.finance).toBeUndefined();
    expect(clients.getLeaveStats).not.toHaveBeenCalled();
    expect(clients.getFinanceStats).not.toHaveBeenCalled();
  });

  it("returns no sections at all for a caller with none of the relevant permissions", async () => {
    const clients = fakeClients();
    const service = createDashboardService({ statsClients: clients });

    const summary = await service.getDashboardSummary(ORG, ["document.read"]);

    expect(summary).toEqual({ unavailableSections: [] });
  });

  it("marks a permitted section unavailable (without failing the whole request) when its service is down", async () => {
    const clients = fakeClients({
      getFinanceStats: vi.fn(async () => {
        throw new StatsUnavailableError("finance-service", "connection refused");
      }),
    });
    const service = createDashboardService({ statsClients: clients });

    const summary = await service.getDashboardSummary(ORG, ALL_PERMISSIONS);

    expect(summary.finance).toBeUndefined();
    expect(summary.unavailableSections).toEqual(["finance"]);
    // The other sections still succeeded - one down service doesn't sink the dashboard.
    expect(summary.employees).toBeDefined();
    expect(summary.crm).toBeDefined();
  });

  it("re-throws an unexpected (non-StatsUnavailableError) failure instead of swallowing it", async () => {
    const clients = fakeClients({
      getCrmStats: vi.fn(async () => {
        throw new Error("something genuinely unexpected");
      }),
    });
    const service = createDashboardService({ statsClients: clients });

    await expect(service.getDashboardSummary(ORG, ALL_PERMISSIONS)).rejects.toThrow(
      "something genuinely unexpected",
    );
  });
});
