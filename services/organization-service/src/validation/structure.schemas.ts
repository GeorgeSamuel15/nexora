import { z } from "zod";
import { nonEmptyString, uuidSchema } from "@nexora/validation";

export const createDepartmentSchema = z.object({
  name: nonEmptyString.max(150),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  name: nonEmptyString.max(150),
});
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const createTeamSchema = z.object({
  name: nonEmptyString.max(150),
  departmentId: uuidSchema.optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: nonEmptyString.max(150).optional(),
  departmentId: uuidSchema.nullable().optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
