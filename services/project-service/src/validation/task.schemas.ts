import { z } from "zod";
import {
  buildListQuerySchema,
  dateOnlySchema,
  nonEmptyString,
  sortOrderSchema,
  uuidSchema,
} from "@nexora/validation";

const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "CANCELLED"]);
const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const createTaskSchema = z.object({
  projectId: uuidSchema,
  title: nonEmptyString.max(200),
  description: z.string().trim().max(5000).optional(),
  assigneeId: uuidSchema.optional(),
  priority: prioritySchema.default("MEDIUM"),
  dueDate: dateOnlySchema.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: nonEmptyString.max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: prioritySchema.optional(),
  status: taskStatusSchema.optional(),
  dueDate: dateOnlySchema.nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const assignTaskSchema = z.object({
  assigneeId: uuidSchema.nullable(),
});
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

export const listTasksQuerySchema = buildListQuerySchema({
  projectId: uuidSchema.optional(),
  assigneeId: uuidSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: prioritySchema.optional(),
  sortBy: z.enum(["createdAt", "dueDate", "priority"]).default("createdAt"),
  sortOrder: sortOrderSchema,
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const createCommentSchema = z.object({
  content: nonEmptyString.max(3000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
