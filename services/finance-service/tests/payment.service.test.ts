import { describe, expect, it, vi } from "vitest";
import { ConflictError } from "@nexora/http";
import type { EventPublisher, NexoraEvent } from "@nexora/events";
import { createInvoiceService } from "../src/services/invoice.service.js";
import { createPaymentService } from "../src/services/payment.service.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG = "org_1";
const CREATOR = "user_creator";
const CLIENT = "client_1";

function capturingPublisher(): EventPublisher & { events: NexoraEvent[] } {
  const events: NexoraEvent[] = [];
  return { events, publish: vi.fn(async (event: NexoraEvent) => void events.push(event)) };
}

const invoiceInput = {
  invoiceNumber: "INV-100",
  clientId: CLIENT,
  issueDate: "2026-03-01",
  dueDate: "2026-03-31",
  tax: 0,
  currency: "USD",
  items: [{ description: "Service", quantity: 1, unitPrice: 1000 }],
};

async function setup() {
  const prisma = createFakePrisma();
  const invoiceEvents = capturingPublisher();
  const paymentEvents = capturingPublisher();
  const invoiceService = createInvoiceService({ prisma, eventPublisher: invoiceEvents });
  const paymentService = createPaymentService({
    prisma,
    invoiceService,
    eventPublisher: paymentEvents,
  });
  const invoice = await invoiceService.createInvoice(ORG, CREATOR, invoiceInput);
  return { prisma, invoiceService, paymentService, paymentEvents, invoice };
}

describe("recordPayment", () => {
  it("refuses to record a payment against a DRAFT invoice", async () => {
    const { paymentService, invoice } = await setup();
    await expect(
      paymentService.recordPayment(ORG, "user_finance", {
        invoiceId: invoice.id,
        amount: 100,
        paymentDate: "2026-03-05",
        method: "bank_transfer",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("a partial payment moves the invoice to PARTIALLY_PAID and publishes PAYMENT_RECEIVED", async () => {
    const { invoiceService, paymentService, paymentEvents, invoice } = await setup();
    await invoiceService.sendInvoice(ORG, invoice.id);

    await paymentService.recordPayment(ORG, "user_finance", {
      invoiceId: invoice.id,
      amount: 400,
      paymentDate: "2026-03-05",
      method: "bank_transfer",
    });

    const updated = await invoiceService.getInvoiceOrThrow(ORG, invoice.id);
    expect(updated.status).toBe("PARTIALLY_PAID");
    expect(paymentEvents.events).toHaveLength(1);
    expect(paymentEvents.events[0]?.type).toBe("PAYMENT_RECEIVED");
  });

  it("paying the full remaining balance moves the invoice to PAID", async () => {
    const { invoiceService, paymentService, invoice } = await setup();
    await invoiceService.sendInvoice(ORG, invoice.id);

    await paymentService.recordPayment(ORG, "user_finance", {
      invoiceId: invoice.id,
      amount: 400,
      paymentDate: "2026-03-05",
      method: "card",
    });
    await paymentService.recordPayment(ORG, "user_finance", {
      invoiceId: invoice.id,
      amount: 600,
      paymentDate: "2026-03-10",
      method: "card",
    });

    const updated = await invoiceService.getInvoiceOrThrow(ORG, invoice.id);
    expect(updated.status).toBe("PAID");
  });

  it("refuses to record a payment against a CANCELLED invoice", async () => {
    const { invoiceService, paymentService, invoice } = await setup();
    await invoiceService.sendInvoice(ORG, invoice.id);
    await invoiceService.cancelInvoice(ORG, invoice.id);

    await expect(
      paymentService.recordPayment(ORG, "user_finance", {
        invoiceId: invoice.id,
        amount: 100,
        paymentDate: "2026-03-05",
        method: "card",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("lists payments for an invoice in descending date order", async () => {
    const { invoiceService, paymentService, invoice } = await setup();
    await invoiceService.sendInvoice(ORG, invoice.id);
    await paymentService.recordPayment(ORG, "user_finance", {
      invoiceId: invoice.id,
      amount: 200,
      paymentDate: "2026-03-05",
      method: "card",
    });
    await paymentService.recordPayment(ORG, "user_finance", {
      invoiceId: invoice.id,
      amount: 200,
      paymentDate: "2026-03-10",
      method: "card",
    });

    const list = await paymentService.listPaymentsForInvoice(ORG, invoice.id);
    expect(list).toHaveLength(2);
    expect((list[0] as { paymentDate: Date }).paymentDate.getTime()).toBeGreaterThan(
      (list[1] as { paymentDate: Date }).paymentDate.getTime(),
    );
  });
});

describe("payment safety", () => {
  it("rejects overpayment without creating a payment", async () => {
    const { invoiceService, paymentService, invoice } = await setup();
    await invoiceService.sendInvoice(ORG, invoice.id);
    await expect(
      paymentService.recordPayment(ORG, CREATOR, {
        invoiceId: invoice.id,
        amount: 1000.01,
        paymentDate: "2026-03-05",
        method: "card",
      }),
    ).rejects.toThrow("remaining invoice balance");
    expect(await paymentService.listPaymentsForInvoice(ORG, invoice.id)).toHaveLength(0);
  });
  it("replays a payment key without collecting twice", async () => {
    const { invoiceService, paymentService, paymentEvents, invoice } = await setup();
    await invoiceService.sendInvoice(ORG, invoice.id);
    const input = {
      invoiceId: invoice.id,
      amount: 1000,
      paymentDate: "2026-03-05",
      method: "card",
      idempotencyKey: "2e096af5-86ba-40f5-b28c-954930ba5177",
    };
    const first = await paymentService.recordPayment(ORG, CREATOR, input);
    const second = await paymentService.recordPayment(ORG, CREATOR, input);
    expect(second.id).toBe(first.id);
    expect(await paymentService.listPaymentsForInvoice(ORG, invoice.id)).toHaveLength(1);
    expect(paymentEvents.events).toHaveLength(1);
    await expect(
      paymentService.recordPayment(ORG, CREATOR, { ...input, amount: 900 }),
    ).rejects.toThrow("another payment");
  });
});
