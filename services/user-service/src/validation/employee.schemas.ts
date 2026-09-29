import { z } from "zod";
import { buildListQuerySchema, emailSchema, nonEmptyString, uuidSchema } from "@nexora/validation";

const employmentTypeSchema = z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]);
const employmentStatusSchema = z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]);

export const createEmployeeSchema = z.object({
  userId: uuidSchema.optional(),
  employeeNumber: nonEmptyString.max(50),
  firstName: nonEmptyString.max(100),
  lastName: nonEmptyString.max(100),
  email: emailSchema,
  phone: z.string().trim().max(30).optional(),
  jobTitle: z.string().trim().max(150).optional(),
  departmentId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
  managerId: uuidSchema.optional(),
  employmentType: employmentTypeSchema.default("FULL_TIME"),
  hireDate: z.coerce.date(),
  location: z.string().trim().max(150).optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  firstName: nonEmptyString.max(100).optional(),
  lastName: nonEmptyString.max(100).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  jobTitle: z.string().trim().max(150).nullable().optional(),
  departmentId: uuidSchema.nullable().optional(),
  teamId: uuidSchema.nullable().optional(),
  managerId: uuidSchema.nullable().optional(),
  employmentType: employmentTypeSchema.optional(),
  employmentStatus: employmentStatusSchema.optional(),
  location: z.string().trim().max(150).nullable().optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = buildListQuerySchema({
  departmentId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
  employmentStatus: employmentStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
