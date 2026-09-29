import { z } from "zod";
import { buildListQuerySchema, emailSchema, nonEmptyString } from "@nexora/validation";

export const createClientSchema = z.object({
  name: nonEmptyString.max(200),
  company: z.string().trim().max(200).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(5000).optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = z.object({
  name: nonEmptyString.max(200).optional(),
  company: z.string().trim().max(200).nullable().optional(),
  email: emailSchema.nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const listClientsQuerySchema = buildListQuerySchema({
  search: z.string().trim().max(200).optional(),
});
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const createContactSchema = z.object({
  name: nonEmptyString.max(200),
  email: emailSchema.optional(),
  phone: z.string().trim().max(30).optional(),
  jobTitle: z.string().trim().max(150).optional(),
  isPrimary: z.boolean().default(false),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;
