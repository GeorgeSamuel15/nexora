import { z } from "zod";
import { buildListQuerySchema } from "@nexora/validation";

export const listNotificationsQuerySchema = buildListQuerySchema({
  isRead: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
