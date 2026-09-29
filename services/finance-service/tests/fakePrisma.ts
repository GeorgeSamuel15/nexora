import type { PrismaClient } from "../generated/client/index.js";

interface FakeInvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeInvoice {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  clientId: string;
  issueDate: Date;
  dueDate: Date;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeExpense {
  id: string;
  organizationId: string;
  title: string;
  category: string;
  amount: number;
  date: Date;
  description: string | null;
  submittedBy: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakePayment {
  idempotencyKey?: string;
  id: string;
  organizationId: string;
  invoiceId: string;
  amount: number;
  paymentDate: Date;
  method: string;
  reference: string | null;
  notes: string | null;
  recordedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createFakePrisma() {
  const invoices = new Map<string, FakeInvoice>();
  const items = new Map<string, FakeInvoiceItem>();
  const expenses = new Map<string, FakeExpense>();
  const payments = new Map<string, FakePayment>();

  function invoiceWithItems(invoice: FakeInvoice) {
    return { ...invoice, items: [...items.values()].filter((i) => i.invoiceId === invoice.id) };
  }
  function invoiceWithPayments(invoice: FakeInvoice) {
    return {
      ...invoice,
      payments: [...payments.values()].filter((p) => p.invoiceId === invoice.id),
    };
  }

  const fake = {
    invoice: {
      create: async ({
        data,
      }: {
        data: Pick<FakeInvoice, "organizationId" | "invoiceNumber" | "clientId" | "createdBy"> &
          Partial<FakeInvoice> & {
            items: {
              create: Array<Omit<FakeInvoiceItem, "id" | "invoiceId" | "createdAt" | "updatedAt">>;
            };
          };
      }) => {
        const invoice: FakeInvoice = {
          id: nextId("invoice"),
          status: "DRAFT",
          subtotal: 0,
          tax: 0,
          total: 0,
          currency: "USD",
          notes: null,
          issueDate: new Date(),
          dueDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        invoices.set(invoice.id, invoice);
        for (const itemData of data.items.create) {
          const item: FakeInvoiceItem = {
            id: nextId("item"),
            invoiceId: invoice.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...itemData,
          };
          items.set(item.id, item);
        }
        return invoiceWithItems(invoice);
      },
      findUnique: async ({
        where,
        include,
      }: {
        where: {
          id?: string;
          organizationId_invoiceNumber?: { organizationId: string; invoiceNumber: string };
        };
        include?: { payments?: boolean };
      }) => {
        let invoice: FakeInvoice | undefined;
        if (where.id) invoice = invoices.get(where.id);
        else if (where.organizationId_invoiceNumber) {
          const { organizationId, invoiceNumber } = where.organizationId_invoiceNumber;
          invoice = [...invoices.values()].find(
            (i) => i.organizationId === organizationId && i.invoiceNumber === invoiceNumber,
          );
        }
        if (!invoice) return null;
        return include?.payments ? invoiceWithPayments(invoice) : invoice;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) => {
        const invoice = [...invoices.values()].find(
          (i) => i.id === where.id && i.organizationId === where.organizationId,
        );
        return invoice ?? null;
      },
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: { organizationId: string; status?: string; clientId?: string };
        skip?: number;
        take?: number;
      }) =>
        [...invoices.values()]
          .filter(
            (i) =>
              i.organizationId === where.organizationId &&
              (where.status === undefined || i.status === where.status) &&
              (where.clientId === undefined || i.clientId === where.clientId),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: async ({
        where,
      }: {
        where: { organizationId: string; status?: string | { in: string[] }; clientId?: string };
      }) =>
        [...invoices.values()].filter((i) => {
          if (i.organizationId !== where.organizationId) return false;
          if (where.clientId !== undefined && i.clientId !== where.clientId) return false;
          if (where.status !== undefined) {
            if (typeof where.status === "string") {
              if (i.status !== where.status) return false;
            } else if (!where.status.in.includes(i.status)) {
              return false;
            }
          }
          return true;
        }).length,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeInvoice> & {
          items?: {
            create: Array<Omit<FakeInvoiceItem, "id" | "invoiceId" | "createdAt" | "updatedAt">>;
          };
        };
      }) => {
        const invoice = invoices.get(where.id);
        if (!invoice) throw new Error("invoice not found");
        const { items: itemsToCreate, ...rest } = data;
        Object.assign(invoice, rest, { updatedAt: new Date() });
        if (itemsToCreate) {
          for (const itemData of itemsToCreate.create) {
            const item: FakeInvoiceItem = {
              id: nextId("item"),
              invoiceId: invoice.id,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...itemData,
            };
            items.set(item.id, item);
          }
        }
        return invoiceWithItems(invoice);
      },
      aggregate: async ({
        where,
      }: {
        where: { organizationId: string; status?: { not?: string; in?: string[] } };
      }) => {
        const list = [...invoices.values()].filter(
          (i) =>
            i.organizationId === where.organizationId &&
            (where.status?.not === undefined || i.status !== where.status.not) &&
            (where.status?.in === undefined || where.status.in.includes(i.status)),
        );
        return { _sum: { total: list.length ? list.reduce((sum, i) => sum + i.total, 0) : null } };
      },
    },
    invoiceItem: {
      deleteMany: async ({ where }: { where: { invoiceId: string } }) => {
        let count = 0;
        for (const [id, item] of items.entries()) {
          if (item.invoiceId === where.invoiceId) {
            items.delete(id);
            count += 1;
          }
        }
        return { count };
      },
    },
    expense: {
      create: async ({
        data,
      }: {
        data: Pick<
          FakeExpense,
          "organizationId" | "title" | "category" | "amount" | "date" | "submittedBy"
        > &
          Partial<FakeExpense>;
      }) => {
        const expense: FakeExpense = {
          id: nextId("expense"),
          description: null,
          status: "PENDING",
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        expenses.set(expense.id, expense);
        return expense;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...expenses.values()].find(
          (e) => e.id === where.id && e.organizationId === where.organizationId,
        ) ?? null,
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: { organizationId: string; status?: string; submittedBy?: string };
        skip?: number;
        take?: number;
      }) =>
        [...expenses.values()]
          .filter(
            (e) =>
              e.organizationId === where.organizationId &&
              (where.status === undefined || e.status === where.status) &&
              (where.submittedBy === undefined || e.submittedBy === where.submittedBy),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: async ({
        where,
      }: {
        where: { organizationId: string; status?: string; submittedBy?: string };
      }) =>
        [...expenses.values()].filter(
          (e) =>
            e.organizationId === where.organizationId &&
            (where.status === undefined || e.status === where.status) &&
            (where.submittedBy === undefined || e.submittedBy === where.submittedBy),
        ).length,
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeExpense> }) => {
        const expense = expenses.get(where.id);
        if (!expense) throw new Error("expense not found");
        Object.assign(expense, data, { updatedAt: new Date() });
        return expense;
      },
      aggregate: async ({ where }: { where: { organizationId: string; status: string } }) => {
        const list = [...expenses.values()].filter(
          (e) => e.organizationId === where.organizationId && e.status === where.status,
        );
        return {
          _sum: { amount: list.length ? list.reduce((sum, e) => sum + e.amount, 0) : null },
        };
      },
    },
    payment: {
      create: async ({
        data,
      }: {
        data: Pick<
          FakePayment,
          "organizationId" | "invoiceId" | "amount" | "paymentDate" | "method" | "recordedBy"
        > &
          Partial<FakePayment>;
      }) => {
        const payment: FakePayment = {
          id: nextId("payment"),
          reference: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        payments.set(payment.id, payment);
        return payment;
      },
      findFirst: async ({
        where,
      }: {
        where: { id?: string; organizationId: string; idempotencyKey?: string };
      }) =>
        [...payments.values()].find(
          (p) =>
            (!where.id || p.id === where.id) &&
            (!where.idempotencyKey || p.idempotencyKey === where.idempotencyKey) &&
            p.organizationId === where.organizationId,
        ) ?? null,
      findMany: async ({ where }: { where: { invoiceId: string } }) =>
        [...payments.values()]
          .filter((p) => p.invoiceId === where.invoiceId)
          .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime()),
      aggregate: async ({ where }: { where: { organizationId: string } }) => {
        const list = [...payments.values()].filter(
          (p) => p.organizationId === where.organizationId,
        );
        return {
          _sum: { amount: list.length ? list.reduce((sum, p) => sum + p.amount, 0) : null },
        };
      },
    },
    $transaction: async (
      operations: Promise<unknown>[] | ((tx: PrismaClient) => Promise<unknown>),
    ): Promise<unknown> =>
      typeof operations === "function"
        ? operations(fake as unknown as PrismaClient)
        : Promise.all(operations),
  };

  return fake as unknown as PrismaClient;
}
