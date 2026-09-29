import { omitUndefined } from "@nexora/utils";
import { Prisma, type PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import { buildEvent, type EventPublisher, type InvoiceCreatedEvent } from "@nexora/events";
import type { PaginatedResult } from "@nexora/types";
import type {
  CreateInvoiceInput,
  InvoiceItemInput,
  ListInvoicesQuery,
  UpdateInvoiceInput,
  UpdateInvoiceItemsInput,
} from "../validation/invoice.schemas.js";
export interface InvoiceServiceDeps {
  prisma: PrismaClient;
  eventPublisher: EventPublisher;
  now?: () => Date;
}
function computeItemTotals(items: InvoiceItemInput[]) {
  const withAmounts = items.map((item) => ({
    ...item,
    amount: new Prisma.Decimal(item.quantity).mul(item.unitPrice).toDecimalPlaces(2).toNumber(),
  }));
  const subtotal = withAmounts
    .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
    .toNumber();
  return { withAmounts, subtotal };
}
export function createInvoiceService(deps: InvoiceServiceDeps) {
  const { prisma, eventPublisher } = deps;
  const now = deps.now ?? (() => new Date());
  async function createInvoice(
    organizationId: string,
    createdBy: string,
    input: CreateInvoiceInput,
  ) {
    const existing = await prisma.invoice.findUnique({
      where: {
        organizationId_invoiceNumber: { organizationId, invoiceNumber: input.invoiceNumber },
      },
    });
    if (existing) {
      throw new ConflictError(`Invoice number "${input.invoiceNumber}" is already in use.`);
    }
    const { withAmounts, subtotal } = computeItemTotals(input.items);
    const total = new Prisma.Decimal(subtotal).plus(input.tax).toDecimalPlaces(2).toNumber();
    const invoice = await prisma.invoice.create({
      data: omitUndefined({
        organizationId,
        invoiceNumber: input.invoiceNumber,
        clientId: input.clientId,
        issueDate: new Date(`${input.issueDate}T00:00:00Z`),
        dueDate: new Date(`${input.dueDate}T00:00:00Z`),
        subtotal,
        tax: input.tax,
        total,
        currency: input.currency,
        notes: input.notes,
        createdBy,
        items: { create: withAmounts },
      }),
      include: { items: true },
    });
    await eventPublisher.publish(
      buildEvent<InvoiceCreatedEvent>("INVOICE_CREATED", organizationId, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId,
        total: Number(invoice.total),
        createdBy,
      }),
    );
    return invoice;
  }
  /** Applies automatic status transitions: fully paid -> PAID, partially
   * paid -> PARTIALLY_PAID, unpaid and past due -> OVERDUE. Never
   * overrides a manually-set DRAFT or CANCELLED state - those only change
   * through explicit actions (send/cancel), not payment math. */
  async function recomputeStatus(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true, items: true },
    });
    if (!invoice) {
      throw new NotFoundError("Invoice");
    }
    if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") {
      return invoice;
    }
    const paid = (
      invoice.payments as Array<{
        amount: Prisma.Decimal | number;
      }>
    ).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    let nextStatus = invoice.status;
    if (paid.greaterThanOrEqualTo(invoice.total)) {
      nextStatus = "PAID";
    } else if (paid.greaterThan(0)) {
      nextStatus = "PARTIALLY_PAID";
    } else if (invoice.dueDate < now()) {
      nextStatus = "OVERDUE";
    } else {
      nextStatus = "SENT";
    }
    if (nextStatus === invoice.status) {
      return invoice;
    }
    return prisma.invoice.update({
      where: { id: invoiceId },
      data: omitUndefined({ status: nextStatus }),
    });
  }
  async function getInvoiceOrThrow(organizationId: string, invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) {
      throw new NotFoundError("Invoice");
    }
    // Read-time "repair" so OVERDUE reflects reality even without a
    // scheduled job - there's no cron/worker infrastructure in V1.
    return recomputeStatus(invoice.id);
  }
  async function listInvoices(
    organizationId: string,
    query: ListInvoicesQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.invoice.count({ where }),
    ]);
    const data = await Promise.all(
      (
        invoices as Array<{
          id: string;
        }>
      ).map((invoice) => recomputeStatus(invoice.id)),
    );
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function updateInvoice(
    organizationId: string,
    invoiceId: string,
    input: UpdateInvoiceInput,
  ) {
    const invoice = await getInvoiceOrThrow(organizationId, invoiceId);
    if (invoice.status !== "DRAFT") {
      throw new ConflictError("Only a DRAFT invoice's details can be edited.");
    }
    const nextTax = input.tax ?? invoice.tax;
    const total = new Prisma.Decimal(invoice.subtotal).plus(nextTax).toDecimalPlaces(2).toNumber();
    return prisma.invoice.update({
      where: { id: invoiceId },
      data: omitUndefined({
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : undefined,
        tax: input.tax,
        total,
        notes: input.notes,
      }),
    });
  }
  async function updateItems(
    organizationId: string,
    invoiceId: string,
    input: UpdateInvoiceItemsInput,
  ) {
    const invoice = await getInvoiceOrThrow(organizationId, invoiceId);
    if (invoice.status !== "DRAFT") {
      throw new ConflictError("Invoice items can only be changed while the invoice is DRAFT.");
    }
    const { withAmounts, subtotal } = computeItemTotals(input.items);
    const total = new Prisma.Decimal(subtotal).plus(invoice.tax).toDecimalPlaces(2).toNumber();
    await prisma.$transaction([
      prisma.invoiceItem.deleteMany({ where: { invoiceId } }),
      prisma.invoice.update({
        where: { id: invoiceId },
        data: omitUndefined({ subtotal, total, items: { create: withAmounts } }),
      }),
    ]);
    return getInvoiceOrThrow(organizationId, invoiceId);
  }
  async function sendInvoice(organizationId: string, invoiceId: string) {
    const invoice = await getInvoiceOrThrow(organizationId, invoiceId);
    if (invoice.status !== "DRAFT") {
      throw new ConflictError("Only a DRAFT invoice can be sent.");
    }
    return prisma.invoice.update({
      where: { id: invoiceId },
      data: omitUndefined({ status: "SENT" }),
    });
  }
  async function cancelInvoice(organizationId: string, invoiceId: string) {
    const invoice = await getInvoiceOrThrow(organizationId, invoiceId);
    if (
      invoice.status === "PAID" ||
      invoice.status === "PARTIALLY_PAID" ||
      invoice.status === "CANCELLED"
    ) {
      throw new ConflictError(`An invoice that is ${invoice.status} cannot be cancelled.`);
    }
    return prisma.invoice.update({
      where: { id: invoiceId },
      data: omitUndefined({ status: "CANCELLED" }),
    });
  }
  return {
    createInvoice,
    listInvoices,
    getInvoiceOrThrow,
    updateInvoice,
    updateItems,
    sendInvoice,
    cancelInvoice,
    recomputeStatus,
  };
}
export type InvoiceService = ReturnType<typeof createInvoiceService>;
