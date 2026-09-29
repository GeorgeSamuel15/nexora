import { z } from "zod";
import { emailSchema } from "@nexora/validation";
import { ROLES } from "@nexora/types";

const invitableRoles = ROLES.filter((role) => role !== "OWNER") as [string, ...string[]];

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(invitableRoles),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
