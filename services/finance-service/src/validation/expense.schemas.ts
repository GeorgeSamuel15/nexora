import { z } from "zod";
import { buildListQuerySchema, dateOnlySchema, nonEmptyString } from "@nexora/validation";

export const createExpenseSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  title: nonEmptyString.max(200),
  category: nonEmptyString.max(100),
  amount: z.number().positive(),
  date: dateOnlySchema,
  description: z.string().trim().max(2000).optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const listExpensesQuerySchema = buildListQuerySchema({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  submittedBy: z.string().uuid().optional(),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
