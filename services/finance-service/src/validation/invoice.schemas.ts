import { z } from "zod";
import {
  buildListQuerySchema,
  dateOnlySchema,
  nonEmptyString,
  uuidSchema,
} from "@nexora/validation";

const invoiceStatusSchema = z.enum([
  "DRAFT",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
]);

export const invoiceItemInputSchema = z.object({
  description: nonEmptyString.max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const createInvoiceSchema = z.object({
  invoiceNumber: nonEmptyString.max(50),
  clientId: uuidSchema,
  issueDate: dateOnlySchema,
  dueDate: dateOnlySchema,
  tax: z.number().min(0).default(0),
  currency: z.string().trim().length(3).default("USD"),
  notes: z.string().trim().max(5000).optional(),
  items: z.array(invoiceItemInputSchema).min(1).max(200),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceItemsSchema = z.object({
  items: z.array(invoiceItemInputSchema).min(1).max(200),
});
export type UpdateInvoiceItemsInput = z.infer<typeof updateInvoiceItemsSchema>;

export const updateInvoiceSchema = z.object({
  dueDate: dateOnlySchema.optional(),
  tax: z.number().min(0).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const listInvoicesQuerySchema = buildListQuerySchema({
  status: invoiceStatusSchema.optional(),
  clientId: uuidSchema.optional(),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
