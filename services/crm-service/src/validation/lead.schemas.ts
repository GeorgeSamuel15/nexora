import { z } from "zod";
import { buildListQuerySchema, emailSchema, nonEmptyString, uuidSchema } from "@nexora/validation";

const leadStatusSchema = z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"]);

export const createLeadSchema = z.object({
  name: nonEmptyString.max(200),
  company: z.string().trim().max(200).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().max(30).optional(),
  source: z.string().trim().max(100).optional(),
  ownerId: uuidSchema,
  notes: z.string().trim().max(5000).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object({
  name: nonEmptyString.max(200).optional(),
  company: z.string().trim().max(200).nullable().optional(),
  email: emailSchema.nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  source: z.string().trim().max(100).nullable().optional(),
  status: leadStatusSchema.optional(),
  ownerId: uuidSchema.optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const listLeadsQuerySchema = buildListQuerySchema({
  status: leadStatusSchema.optional(),
  ownerId: uuidSchema.optional(),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
