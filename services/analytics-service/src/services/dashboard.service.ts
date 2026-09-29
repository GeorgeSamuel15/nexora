import type { Permission } from "@nexora/types";
import type {
  CrmStats,
  EmployeeStats,
  FinanceStats,
  LeaveStats,
  ProjectStats,
  StatsClients,
} from "../clients/statsClients.js";
import { StatsUnavailableError } from "../clients/statsClient.js";

export interface DashboardSummary {
  employees?: EmployeeStats;
  hr?: LeaveStats;
  projects?: ProjectStats;
  crm?: CrmStats;
  finance?: FinanceStats;
  /** Sections the caller has permission to see, but that couldn't be
   * fetched right now (the owning service was unreachable) - distinct
   * from a section simply being omitted for lack of permission. A
   * dashboard should show "unavailable" for these, not silently hide
   * them or throw and lose the sections that DID succeed. */
  unavailableSections: string[];
}

export interface DashboardServiceDeps {
  statsClients: StatsClients;
}

interface SectionSpec<TResult> {
  key: keyof Omit<DashboardSummary, "unavailableSections">;
  requiredPermission: Permission;
  fetch: (organizationId: string) => Promise<TResult>;
}

export function createDashboardService(deps: DashboardServiceDeps) {
  const { statsClients } = deps;

  /** Which sections the response includes depends on what the caller can
   * see (build spec section 21: "The dashboard should adapt based on the
   * user's permissions/role") - a section the caller lacks permission for
   * isn't just hidden after fetching, it's never fetched at all. */
  async function getDashboardSummary(
    organizationId: string,
    permissions: readonly Permission[],
  ): Promise<DashboardSummary> {
    const has = (permission: Permission) => permissions.includes(permission);

    const sections: SectionSpec<unknown>[] = [
      {
        key: "employees",
        requiredPermission: "employee.read",
        fetch: statsClients.getEmployeeStats,
      },
      { key: "hr", requiredPermission: "leave.read", fetch: statsClients.getLeaveStats },
      { key: "projects", requiredPermission: "project.read", fetch: statsClients.getProjectStats },
      { key: "crm", requiredPermission: "crm.read", fetch: statsClients.getCrmStats },
      { key: "finance", requiredPermission: "finance.read", fetch: statsClients.getFinanceStats },
    ];

    const summary: Record<string, unknown> = { unavailableSections: [] as string[] };

    await Promise.all(
      sections
        .filter((section) => has(section.requiredPermission))
        .map(async (section) => {
          try {
            summary[section.key] = await section.fetch(organizationId);
          } catch (err) {
            if (err instanceof StatsUnavailableError) {
              (summary.unavailableSections as string[]).push(section.key);
            } else {
              throw err;
            }
          }
        }),
    );

    return summary as unknown as DashboardSummary;
  }

  return { getDashboardSummary };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
