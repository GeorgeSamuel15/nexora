import { z } from "zod";
import {
  buildListQuerySchema,
  dateOnlySchema,
  nonEmptyString,
  uuidSchema,
} from "@nexora/validation";

export const createDealSchema = z.object({
  title: nonEmptyString.max(200),
  clientId: uuidSchema,
  ownerId: uuidSchema,
  pipelineId: uuidSchema,
  stageId: uuidSchema,
  value: z.number().min(0),
  expectedCloseDate: dateOnlySchema.optional(),
  probability: z.number().int().min(0).max(100).default(50),
  notes: z.string().trim().max(5000).optional(),
});
export type CreateDealInput = z.infer<typeof createDealSchema>;

export const updateDealSchema = z.object({
  title: nonEmptyString.max(200).optional(),
  ownerId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  value: z.number().min(0).optional(),
  expectedCloseDate: dateOnlySchema.nullable().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
export type UpdateDealInput = z.infer<typeof updateDealSchema>;

export const listDealsQuerySchema = buildListQuerySchema({
  pipelineId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  status: z.enum(["OPEN", "WON", "LOST"]).optional(),
  ownerId: uuidSchema.optional(),
  clientId: uuidSchema.optional(),
});
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;
