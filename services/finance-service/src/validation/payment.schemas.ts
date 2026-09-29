import { z } from "zod";
import { dateOnlySchema, nonEmptyString, uuidSchema } from "@nexora/validation";

export const createPaymentSchema = z.object({
  invoiceId: uuidSchema,
  idempotencyKey: uuidSchema.optional(),
  amount: z.number().positive().max(999999999999).multipleOf(0.01),
  paymentDate: dateOnlySchema,
  method: nonEmptyString.max(50),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
