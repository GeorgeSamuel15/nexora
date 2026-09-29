import { describe, expect, it } from "vitest";
import { ConflictError } from "@nexora/http";
import { createExpenseService } from "../src/services/expense.service.js";
import { createInvoiceService } from "../src/services/invoice.service.js";
import { createPaymentService } from "../src/services/payment.service.js";
import { createReportingService } from "../src/services/reporting.service.js";
import { createFakePrisma } from "./fakePrisma.js";
import { vi } from "vitest";

const ORG = "org_1";

describe("expense submission and review", () => {
  it("submits a PENDING expense", async () => {
    const prisma = createFakePrisma();
    const service = createExpenseService({ prisma });
    const expense = await service.submitExpense(ORG, "user_1", {
      title: "Client dinner",
      category: "Meals",
      amount: 85.5,
      date: "2026-03-10",
    });
    expect(expense.status).toBe("PENDING");
  });

  it("approves a PENDING expense and records who/when", async () => {
    const prisma = createFakePrisma();
    const service = createExpenseService({ prisma, now: () => new Date("2026-03-11T00:00:00Z") });
    const expense = await service.submitExpense(ORG, "user_1", {
      title: "Flight",
      category: "Travel",
      amount: 400,
      date: "2026-03-10",
    });

    const approved = await service.reviewExpense(
      ORG,
      expense.id,
      "user_finance_manager",
      "APPROVED",
    );
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedBy).toBe("user_finance_manager");
  });

  it("refuses to review an expense that's already been reviewed", async () => {
    const prisma = createFakePrisma();
    const service = createExpenseService({ prisma });
    const expense = await service.submitExpense(ORG, "user_1", {
      title: "Hotel",
      category: "Travel",
      amount: 200,
      date: "2026-03-10",
    });
    await service.reviewExpense(ORG, expense.id, "user_fm", "REJECTED");

    await expect(
      service.reviewExpense(ORG, expense.id, "user_fm", "APPROVED"),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("listing scopes by organization", async () => {
    const prisma = createFakePrisma();
    const service = createExpenseService({ prisma });
    await service.submitExpense("org_a", "user_a", {
      title: "A",
      category: "Misc",
      amount: 10,
      date: "2026-03-10",
    });
    await service.submitExpense("org_b", "user_b", {
      title: "B",
      category: "Misc",
      amount: 10,
      date: "2026-03-10",
    });

    const result = await service.listExpenses("org_a", { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
  });
});

describe("financial summary", () => {
  it("aggregates invoiced, collected, outstanding, and approved expenses", async () => {
    const prisma = createFakePrisma();
    const eventPublisher = { publish: vi.fn(async () => undefined) };
    const invoiceService = createInvoiceService({ prisma, eventPublisher });
    const paymentService = createPaymentService({ prisma, invoiceService, eventPublisher });
    const expenseService = createExpenseService({ prisma });
    const reportingService = createReportingService({ prisma });

    const invoice = await invoiceService.createInvoice(ORG, "user_1", {
      invoiceNumber: "INV-1",
      clientId: "client_1",
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
      tax: 0,
      currency: "USD",
      items: [{ description: "Work", quantity: 1, unitPrice: 1000 }],
    });
    await invoiceService.sendInvoice(ORG, invoice.id);
    await paymentService.recordPayment(ORG, "user_finance", {
      invoiceId: invoice.id,
      amount: 300,
      paymentDate: "2026-03-05",
      method: "card",
    });

    const expense = await expenseService.submitExpense(ORG, "user_1", {
      title: "Supplies",
      category: "Office",
      amount: 50,
      date: "2026-03-02",
    });
    await expenseService.reviewExpense(ORG, expense.id, "user_fm", "APPROVED");
    // A pending expense should NOT count toward totalApprovedExpenses.
    await expenseService.submitExpense(ORG, "user_1", {
      title: "Unapproved",
      category: "Office",
      amount: 999,
      date: "2026-03-02",
    });

    const summary = await reportingService.getFinancialSummary(ORG);
    expect(summary).toEqual({
      currency: "USD",
      totalInvoiced: 1000,
      totalCollected: 300,
      totalOutstanding: 700,
      totalApprovedExpenses: 50,
    });
  });

  it("getDashboardStats reuses the summary and adds an outstanding-invoice count", async () => {
    const prisma = createFakePrisma();
    const eventPublisher = { publish: vi.fn(async () => undefined) };
    const invoiceService = createInvoiceService({ prisma, eventPublisher });
    const reportingService = createReportingService({ prisma });

    const invoice1 = await invoiceService.createInvoice(ORG, "user_1", {
      invoiceNumber: "INV-DASH-1",
      clientId: "client_1",
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
      tax: 0,
      currency: "USD",
      items: [{ description: "Work", quantity: 1, unitPrice: 500 }],
    });
    await invoiceService.sendInvoice(ORG, invoice1.id); // outstanding

    const invoice2 = await invoiceService.createInvoice(ORG, "user_1", {
      invoiceNumber: "INV-DASH-2",
      clientId: "client_1",
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
      tax: 0,
      currency: "USD",
      items: [{ description: "Work", quantity: 1, unitPrice: 500 }],
    });
    void invoice2; // stays DRAFT - must not count as outstanding

    const stats = await reportingService.getDashboardStats(ORG);
    expect(stats.outstandingInvoicesCount).toBe(1);
    expect(stats.revenue).toBe(0);
    expect(stats.outstandingAmount).toBe(500);
  });
});
