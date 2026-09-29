import { fetchInternalStats } from "./statsClient.js";

export interface EmployeeStats {
  totalEmployees: number;
  activeEmployees: number;
}

export interface LeaveStats {
  pendingLeaveRequests: number;
}

export interface ProjectStats {
  activeProjects: number;
  tasksDue: number;
}

export interface CrmStats {
  openDeals: number;
}

export interface FinanceStats {
  revenue: number;
  outstandingInvoicesCount: number;
  outstandingAmount: number;
  totalExpenses: number;
}

export interface StatsClientsConfig {
  internalSecret: string;
  userServiceUrl: string;
  hrServiceUrl: string;
  projectServiceUrl: string;
  crmServiceUrl: string;
  financeServiceUrl: string;
}

export interface StatsClients {
  getEmployeeStats(organizationId: string): Promise<EmployeeStats>;
  getLeaveStats(organizationId: string): Promise<LeaveStats>;
  getProjectStats(organizationId: string): Promise<ProjectStats>;
  getCrmStats(organizationId: string): Promise<CrmStats>;
  getFinanceStats(organizationId: string): Promise<FinanceStats>;
}

export function createStatsClients(config: StatsClientsConfig): StatsClients {
  return {
    getEmployeeStats: (organizationId) =>
      fetchInternalStats<EmployeeStats>(
        "user-service",
        config.userServiceUrl,
        config.internalSecret,
        organizationId,
      ),
    getLeaveStats: (organizationId) =>
      fetchInternalStats<LeaveStats>(
        "hr-service",
        config.hrServiceUrl,
        config.internalSecret,
        organizationId,
      ),
    getProjectStats: (organizationId) =>
      fetchInternalStats<ProjectStats>(
        "project-service",
        config.projectServiceUrl,
        config.internalSecret,
        organizationId,
      ),
    getCrmStats: (organizationId) =>
      fetchInternalStats<CrmStats>(
        "crm-service",
        config.crmServiceUrl,
        config.internalSecret,
        organizationId,
      ),
    getFinanceStats: (organizationId) =>
      fetchInternalStats<FinanceStats>(
        "finance-service",
        config.financeServiceUrl,
        config.internalSecret,
        organizationId,
      ),
  };
}
