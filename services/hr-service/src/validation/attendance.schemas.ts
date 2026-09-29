import { z } from "zod";
import { buildListQuerySchema, dateOnlySchema, uuidSchema } from "@nexora/validation";

export const listAttendanceQuerySchema = buildListQuerySchema({
  employeeId: uuidSchema.optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
});
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
