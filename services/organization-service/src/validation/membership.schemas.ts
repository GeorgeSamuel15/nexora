import { z } from "zod";
import { ROLES } from "@nexora/types";

// OWNER is intentionally excluded - an organization gets exactly one
// OWNER, assigned at registration (see auth-service's register flow).
// Existing memberships can't be promoted to OWNER via this endpoint.
const assignableRoles = ROLES.filter((role) => role !== "OWNER") as [string, ...string[]];

export const updateMembershipRoleSchema = z.object({
  role: z.enum(assignableRoles),
});
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleSchema>;
