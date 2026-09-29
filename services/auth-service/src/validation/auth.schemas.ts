import { z } from "zod";
import { emailSchema, nonEmptyString, passwordSchema } from "@nexora/validation";

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  organizationName: nonEmptyString.max(200),
  firstName: nonEmptyString.max(100),
  lastName: nonEmptyString.max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: nonEmptyString,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: nonEmptyString.optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: nonEmptyString.optional(),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: nonEmptyString,
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: nonEmptyString,
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const acceptInvitationSchema = z.object({
  token: nonEmptyString,
  password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
