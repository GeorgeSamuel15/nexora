import { z } from "zod";
import {
  buildListQuerySchema,
  dateOnlySchema,
  nonEmptyString,
  uuidSchema,
} from "@nexora/validation";

export const createLeaveTypeSchema = z.object({
  name: nonEmptyString.max(100),
  requiresBalance: z.boolean().default(true),
  defaultAnnualDays: z.number().min(0).max(365).optional(),
  isPaid: z.boolean().default(true),
});
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;

export const updateLeaveTypeSchema = z.object({
  name: nonEmptyString.max(100).optional(),
  requiresBalance: z.boolean().optional(),
  defaultAnnualDays: z.number().min(0).max(365).nullable().optional(),
  isPaid: z.boolean().optional(),
});
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;

export const createLeaveRequestSchema = z
  .object({
    leaveTypeId: uuidSchema,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    reason: nonEmptyString.max(1000),
  })
  .refine((value: { startDate: string; endDate: string }) => value.startDate <= value.endDate, {
    message: "startDate must be on or before endDate",
    path: ["endDate"],
  });
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const rejectLeaveRequestSchema = z.object({
  rejectionReason: z.string().trim().max(500).optional(),
});
export type RejectLeaveRequestInput = z.infer<typeof rejectLeaveRequestSchema>;

export const listLeaveRequestsQuerySchema = buildListQuerySchema({
  employeeId: uuidSchema.optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
});
export type ListLeaveRequestsQuery = z.infer<typeof listLeaveRequestsQuerySchema>;
