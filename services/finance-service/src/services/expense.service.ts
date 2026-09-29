import { omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import type { PaginatedResult } from "@nexora/types";
import type { CreateExpenseInput, ListExpensesQuery } from "../validation/expense.schemas.js";
export interface ExpenseServiceDeps {
  prisma: PrismaClient;
  now?: () => Date;
}
export function createExpenseService(deps: ExpenseServiceDeps) {
  const { prisma } = deps;
  const now = deps.now ?? (() => new Date());
  async function submitExpense(
    organizationId: string,
    submittedBy: string,
    input: CreateExpenseInput,
  ) {
    return prisma.expense.create({
      data: omitUndefined({
        organizationId,
        submittedBy,
        title: input.title,
        category: input.category,
        amount: input.amount,
        currency: input.currency ?? "USD",
        date: new Date(`${input.date}T00:00:00Z`),
        description: input.description,
      }),
    });
  }
  async function listExpenses(
    organizationId: string,
    query: ListExpensesQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.submittedBy ? { submittedBy: query.submittedBy } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.expense.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.expense.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function getExpenseOrThrow(organizationId: string, expenseId: string) {
    const expense = await prisma.expense.findFirst({ where: { id: expenseId, organizationId } });
    if (!expense) {
      throw new NotFoundError("Expense");
    }
    return expense;
  }
  async function reviewExpense(
    organizationId: string,
    expenseId: string,
    reviewedBy: string,
    decision: "APPROVED" | "REJECTED",
  ) {
    const expense = await getExpenseOrThrow(organizationId, expenseId);
    if (expense.status !== "PENDING") {
      throw new ConflictError(
        `Only a PENDING expense can be reviewed (this one is ${expense.status}).`,
      );
    }
    return prisma.expense.update({
      where: { id: expenseId },
      data: omitUndefined({ status: decision, reviewedBy, reviewedAt: now() }),
    });
  }
  return { submitExpense, listExpenses, getExpenseOrThrow, reviewExpense };
}
export type ExpenseService = ReturnType<typeof createExpenseService>;
