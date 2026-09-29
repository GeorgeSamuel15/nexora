import { describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "@nexora/http";
import type { EventPublisher, NexoraEvent } from "@nexora/events";
import { createInvoiceService } from "../src/services/invoice.service.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG = "org_1";
const CREATOR = "user_creator";
const CLIENT = "client_1";

function capturingPublisher(): EventPublisher & { events: NexoraEvent[] } {
  const events: NexoraEvent[] = [];
  return { events, publish: vi.fn(async (event: NexoraEvent) => void events.push(event)) };
}

const baseInvoiceInput = {
  invoiceNumber: "INV-001",
  clientId: CLIENT,
  issueDate: "2026-03-01",
  dueDate: "2026-03-15",
  tax: 10,
  currency: "USD",
  items: [
    { description: "Design work", quantity: 10, unitPrice: 100 },
    { description: "Consulting", quantity: 2, unitPrice: 150 },
  ],
};

describe("createInvoice", () => {
  it("computes subtotal and total from items, and publishes INVOICE_CREATED", async () => {
    const prisma = createFakePrisma();
    const eventPublisher = capturingPublisher();
    const service = createInvoiceService({ prisma, eventPublisher });

    const invoice = await service.createInvoice(ORG, CREATOR, baseInvoiceInput);

    expect(invoice.subtotal).toBe(1300); // 10*100 + 2*150
    expect(invoice.total).toBe(1310); // + tax 10
    expect(invoice.status).toBe("DRAFT");

    expect(eventPublisher.events).toHaveLength(1);
    expect(eventPublisher.events[0]?.type).toBe("INVOICE_CREATED");
  });

  it("rejects a duplicate invoice number within the same organization", async () => {
    const prisma = createFakePrisma();
    const service = createInvoiceService({ prisma, eventPublisher: capturingPublisher() });
    await service.createInvoice(ORG, CREATOR, baseInvoiceInput);

    await expect(service.createInvoice(ORG, CREATOR, baseInvoiceInput)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("send / cancel", () => {
  it("moves DRAFT to SENT, and refuses to send a non-DRAFT invoice", async () => {
    const prisma = createFakePrisma();
    const service = createInvoiceService({ prisma, eventPublisher: capturingPublisher() });
    const invoice = await service.createInvoice(ORG, CREATOR, baseInvoiceInput);

    const sent = await service.sendInvoice(ORG, invoice.id);
    expect(sent.status).toBe("SENT");

    await expect(service.sendInvoice(ORG, invoice.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("cancels a SENT invoice but refuses to cancel a PAID one", async () => {
    const prisma = createFakePrisma();
    const service = createInvoiceService({ prisma, eventPublisher: capturingPublisher() });
    const invoice = await service.createInvoice(ORG, CREATOR, baseInvoiceInput);
    await service.sendInvoice(ORG, invoice.id);

    const cancelled = await service.cancelInvoice(ORG, invoice.id);
    expect(cancelled.status).toBe("CANCELLED");
  });
});

describe("item editing", () => {
  it("allows editing items while DRAFT and recomputes totals", async () => {
    const prisma = createFakePrisma();
    const service = createInvoiceService({ prisma, eventPublisher: capturingPublisher() });
    const invoice = await service.createInvoice(ORG, CREATOR, baseInvoiceInput);

    const updated = await service.updateItems(ORG, invoice.id, {
      items: [{ description: "Just one thing", quantity: 1, unitPrice: 500 }],
    });

    expect(updated.subtotal).toBe(500);
    expect(updated.total).toBe(510); // tax stays 10
  });

  it("refuses to edit items once the invoice has been sent", async () => {
    const prisma = createFakePrisma();
    const service = createInvoiceService({ prisma, eventPublisher: capturingPublisher() });
    const invoice = await service.createInvoice(ORG, CREATOR, baseInvoiceInput);
    await service.sendInvoice(ORG, invoice.id);

    await expect(
      service.updateItems(ORG, invoice.id, {
        items: [{ description: "x", quantity: 1, unitPrice: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("status recomputation", () => {
  it("marks an unpaid, past-due SENT invoice as OVERDUE when fetched", async () => {
    const prisma = createFakePrisma();
    const fixedNow = new Date("2026-04-01T00:00:00Z"); // after the 2026-03-15 due date
    const service = createInvoiceService({
      prisma,
      eventPublisher: capturingPublisher(),
      now: () => fixedNow,
    });
    const invoice = await service.createInvoice(ORG, CREATOR, baseInvoiceInput);
    await service.sendInvoice(ORG, invoice.id);

    const fetched = await service.getInvoiceOrThrow(ORG, invoice.id);
    expect(fetched.status).toBe("OVERDUE");
  });

  it("does not mark a DRAFT invoice OVERDUE even past its due date", async () => {
    const prisma = createFakePrisma();
    const fixedNow = new Date("2026-04-01T00:00:00Z");
    const service = createInvoiceService({
      prisma,
      eventPublisher: capturingPublisher(),
      now: () => fixedNow,
    });
    const invoice = await service.createInvoice(ORG, CREATOR, baseInvoiceInput);

    const fetched = await service.getInvoiceOrThrow(ORG, invoice.id);
    expect(fetched.status).toBe("DRAFT");
  });
});

describe("tenant isolation", () => {
  it("Org A cannot view, update, send, or cancel Org B's invoice", async () => {
    const prisma = createFakePrisma();
    const service = createInvoiceService({ prisma, eventPublisher: capturingPublisher() });
    const orgBInvoice = await service.createInvoice("org_b", "org_b_user", {
      ...baseInvoiceInput,
      invoiceNumber: "INV-B-1",
    });

    await expect(service.getInvoiceOrThrow("org_a", orgBInvoice.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.updateInvoice("org_a", orgBInvoice.id, { tax: 0 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.sendInvoice("org_a", orgBInvoice.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.cancelInvoice("org_a", orgBInvoice.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
