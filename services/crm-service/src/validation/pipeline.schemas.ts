import { z } from "zod";
import { nonEmptyString } from "@nexora/validation";

export const createPipelineSchema = z.object({
  name: nonEmptyString.max(150),
  stageNames: z
    .array(nonEmptyString.max(100))
    .min(1)
    .max(20)
    .default(["New", "Qualified", "Proposal", "Negotiation"]),
});
export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;

export const createStageSchema = z.object({
  name: nonEmptyString.max(100),
  order: z.number().int().min(0),
});
export type CreateStageInput = z.infer<typeof createStageSchema>;

export const updateStageSchema = z.object({
  name: nonEmptyString.max(100).optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
