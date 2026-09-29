import { z } from "zod";
import { emailSchema, nonEmptyString, uuidSchema } from "@nexora/validation";

export const bootstrapOrganizationSchema = z.object({
  organizationName: nonEmptyString.max(200),
  ownerUserId: uuidSchema,
  ownerEmail: emailSchema,
  ownerFirstName: nonEmptyString.max(100),
  ownerLastName: nonEmptyString.max(100),
});
export type BootstrapOrganizationInput = z.infer<typeof bootstrapOrganizationSchema>;

export const membershipLookupSchema = z.object({
  userId: uuidSchema,
});
export type MembershipLookupInput = z.infer<typeof membershipLookupSchema>;

export const validateInvitationTokenSchema = z.object({
  token: nonEmptyString,
});
export type ValidateInvitationTokenInput = z.infer<typeof validateInvitationTokenSchema>;

export const consumeInvitationSchema = z.object({
  invitationId: uuidSchema,
  userId: uuidSchema,
});
export type ConsumeInvitationInput = z.infer<typeof consumeInvitationSchema>;
