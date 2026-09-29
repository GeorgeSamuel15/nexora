import { Prisma, type PrismaClient } from "../../generated/client/index.js";

export interface ReportingServiceDeps {
  prisma: PrismaClient;
}

export interface FinancialSummary {
  currency: string;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  totalApprovedExpenses: number;
}

export interface DashboardStats {
  currency: string;
  revenue: number;
  outstandingInvoicesCount: number;
  outstandingAmount: number;
  totalExpenses: number;
}

/** Deliberately minimal - a handful of real aggregate queries, not a
 * dashboard. Analytics-service (Phase 11) owns cross-domain reporting;
 * getDashboardStats is specifically what it calls (via /internal/stats)
 * to build that cross-domain view. */
export function createReportingService(deps: ReportingServiceDeps) {
  const { prisma } = deps;

  async function getFinancialSummary(organizationId: string, currency = "USD"): Promise<FinancialSummary> {
    const [invoiceAgg, paymentAgg, expenseAgg] = await Promise.all([
      prisma.invoice.aggregate({
        // Drafts have not been issued and cannot contribute to receivables.
        where: { organizationId, currency, status: { in: ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
        _sum: { total: true },
      }),
      prisma.payment.aggregate({ where: { organizationId, invoice: { currency } }, _sum: { amount: true } }),
      prisma.expense.aggregate({
        where: { organizationId, currency, status: "APPROVED" },
        _sum: { amount: true },
      }),
    ]);

    const totalInvoiced = Number(invoiceAgg._sum.total ?? 0);
    const totalCollected = Number(paymentAgg._sum.amount ?? 0);
    const totalApprovedExpenses = Number(expenseAgg._sum.amount ?? 0);

    return {
      currency,
      totalInvoiced,
      totalCollected,
      totalOutstanding: Prisma.Decimal.max(0, new Prisma.Decimal(invoiceAgg._sum.total ?? 0).minus(paymentAgg._sum.amount ?? 0)).toNumber(),
      totalApprovedExpenses,
    };
  }

  /** Backs analytics-service's dashboard aggregation (Phase 11) - reuses
   * getFinancialSummary rather than re-querying, plus one more count
   * (outstanding invoices) that summary alone doesn't need. */
  async function getDashboardStats(organizationId: string): Promise<DashboardStats> {
    const [summary, outstandingInvoicesCount] = await Promise.all([
      getFinancialSummary(organizationId),
      prisma.invoice.count({
        where: { organizationId, currency: "USD", status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      }),
    ]);
    return {
      currency: summary.currency,
      revenue: summary.totalCollected,
      outstandingInvoicesCount,
      outstandingAmount: summary.totalOutstanding,
      totalExpenses: summary.totalApprovedExpenses,
    };
  }

  return { getFinancialSummary, getDashboardStats };
}

export type ReportingService = ReturnType<typeof createReportingService>;
