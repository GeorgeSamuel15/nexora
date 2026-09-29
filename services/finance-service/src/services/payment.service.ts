import { omitUndefined } from "@nexora/utils";
import { Prisma, type PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { buildEvent, type EventPublisher, type PaymentReceivedEvent } from "@nexora/events";
import type { InvoiceService } from "./invoice.service.js";
import type { CreatePaymentInput } from "../validation/payment.schemas.js";
export interface PaymentServiceDeps {
  prisma: PrismaClient;
  invoiceService: InvoiceService;
  eventPublisher: EventPublisher;
}
const PAYABLE_STATUSES = new Set(["SENT", "PARTIALLY_PAID", "OVERDUE"]);
export function createPaymentService(deps: PaymentServiceDeps) {
  const { prisma, invoiceService, eventPublisher } = deps;
  async function recordPayment(
    organizationId: string,
    recordedBy: string,
    input: CreatePaymentInput,
  ) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            if (input.idempotencyKey) {
              const previous = await tx.payment.findFirst({
                where: { organizationId, idempotencyKey: input.idempotencyKey },
              });
              if (previous) {
                if (
                  previous.invoiceId !== input.invoiceId ||
                  !new Prisma.Decimal(previous.amount).equals(input.amount) ||
                  previous.method !== input.method ||
                  previous.paymentDate.toISOString().slice(0, 10) !== input.paymentDate ||
                  (previous.reference ?? undefined) !== input.reference ||
                  (previous.notes ?? undefined) !== input.notes
                )
                  throw new ConflictError(
                    "The idempotency key was already used for another payment.",
                  );
                return { payment: previous, created: false };
              }
            }
            const invoice = await tx.invoice.findFirst({
              where: { id: input.invoiceId, organizationId },
            });
            if (!invoice) throw new NotFoundError("Invoice");
            if (!PAYABLE_STATUSES.has(invoice.status))
              throw new ConflictError(
                `Cannot record a payment against an invoice that is ${invoice.status}.`,
              );
            const payments = await tx.payment.findMany({
              where: { invoiceId: invoice.id, organizationId },
            });
            const paid = payments.reduce(
              (sum, payment) => sum.plus(payment.amount),
              new Prisma.Decimal(0),
            );
            const nextPaid = paid.plus(input.amount);
            if (nextPaid.greaterThan(invoice.total))
              throw new ConflictError("Payment exceeds the remaining invoice balance.");
            const payment = await tx.payment.create({
              data: omitUndefined({
                organizationId,
                invoiceId: invoice.id,
                amount: input.amount,
                paymentDate: new Date(`${input.paymentDate}T00:00:00Z`),
                method: input.method,
                reference: input.reference,
                notes: input.notes,
                recordedBy,
                idempotencyKey: input.idempotencyKey,
              }),
            });
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { status: nextPaid.equals(invoice.total) ? "PAID" : "PARTIALLY_PAID" },
            });
            return { payment, created: true };
          },
          { isolationLevel: "Serializable" },
        );
        if (result.created)
          await eventPublisher.publish(
            buildEvent<PaymentReceivedEvent>("PAYMENT_RECEIVED", organizationId, {
              paymentId: result.payment.id,
              invoiceId: input.invoiceId,
              amount: Number(result.payment.amount),
              method: result.payment.method,
            }),
          );
        return result.payment;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if ((code === "P2034" || code === "P2002") && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictError(
      "The invoice changed concurrently. Please retry with the same idempotency key.",
    );
  }
  async function listPaymentsForInvoice(organizationId: string, invoiceId: string) {
    await invoiceService.getInvoiceOrThrow(organizationId, invoiceId);
    return prisma.payment.findMany({ where: { invoiceId }, orderBy: { paymentDate: "desc" } });
  }
  async function getPaymentOrThrow(organizationId: string, paymentId: string) {
    const payment = await prisma.payment.findFirst({ where: { id: paymentId, organizationId } });
    if (!payment) {
      throw new NotFoundError("Payment");
    }
    return payment;
  }
  async function listPayments(organizationId: string, page: number, pageSize: number) {
    const where = { organizationId };
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { paymentDate: "desc" },
      }),
      prisma.payment.count({ where }),
    ]);
    return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }
  return { listPayments, recordPayment, listPaymentsForInvoice, getPaymentOrThrow };
}
export type PaymentService = ReturnType<typeof createPaymentService>;
