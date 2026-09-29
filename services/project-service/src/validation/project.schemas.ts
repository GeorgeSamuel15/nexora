import { z } from "zod";
import {
  buildListQuerySchema,
  dateOnlySchema,
  nonEmptyString,
  uuidSchema,
} from "@nexora/validation";

const projectStatusSchema = z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]);
const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const createProjectSchema = z.object({
  name: nonEmptyString.max(200),
  description: z.string().trim().max(5000).optional(),
  ownerId: uuidSchema,
  priority: prioritySchema.default("MEDIUM"),
  startDate: dateOnlySchema.optional(),
  dueDate: dateOnlySchema.optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: nonEmptyString.max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  ownerId: uuidSchema.optional(),
  status: projectStatusSchema.optional(),
  priority: prioritySchema.optional(),
  startDate: dateOnlySchema.nullable().optional(),
  dueDate: dateOnlySchema.nullable().optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const listProjectsQuerySchema = buildListQuerySchema({
  status: projectStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const addProjectMemberSchema = z.object({
  userId: uuidSchema,
});
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
