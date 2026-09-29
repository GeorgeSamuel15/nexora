import { responseTokens, refreshCredential, clearSession } from "../browserSession.js";
import { omitUndefined } from "@nexora/utils";
import type { Request, Response } from "express";
import { apiSuccess } from "@nexora/types";
import type { AuthService } from "../services/auth.service.js";
import { UnauthorizedError } from "@nexora/http";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  AcceptInvitationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "../validation/auth.schemas.js";

function requestMeta(req: Request) {
  return omitUndefined({ userAgent: req.header("user-agent"), ipAddress: req.ip });
}

export function createAuthController(authService: AuthService) {
  return {
    async register(req: Request, res: Response): Promise<void> {
      const input = req.body as RegisterInput;
      const result = await authService.register(input, requestMeta(req));
      res
        .status(201)
        .json(apiSuccess({ ...result, tokens: responseTokens(req, res, result.tokens) }));
    },

    async acceptInvitation(req: Request, res: Response): Promise<void> {
      const input = req.body as AcceptInvitationInput;
      const result = await authService.acceptInvitation(input, requestMeta(req));
      res
        .status(201)
        .json(apiSuccess({ ...result, tokens: responseTokens(req, res, result.tokens) }));
    },

    async login(req: Request, res: Response): Promise<void> {
      const input = req.body as LoginInput;
      const tokens = await authService.login(input, requestMeta(req));
      res.status(200).json(apiSuccess(responseTokens(req, res, tokens)));
    },

    async refresh(req: Request, res: Response): Promise<void> {
      const tokens = await authService.refresh(refreshCredential(req));
      res.status(200).json(apiSuccess(responseTokens(req, res, tokens)));
    },

    async logout(req: Request, res: Response): Promise<void> {
      await authService.logout(refreshCredential(req));
      clearSession(res);
      res.status(200).json(apiSuccess({ loggedOut: true }));
    },

    async forgotPassword(req: Request, res: Response): Promise<void> {
      const input = req.body as ForgotPasswordInput;
      await authService.forgotPassword(input);
      // Same response whether or not the email exists - see auth.service.ts.
      res
        .status(200)
        .json(apiSuccess({ message: "If that email exists, a reset link has been sent." }));
    },

    async resetPassword(req: Request, res: Response): Promise<void> {
      const input = req.body as ResetPasswordInput;
      await authService.resetPassword(input);
      res.status(200).json(apiSuccess({ passwordReset: true }));
    },

    async verifyEmail(req: Request, res: Response): Promise<void> {
      const input = req.body as VerifyEmailInput;
      await authService.verifyEmail(input);
      res.status(200).json(apiSuccess({ emailVerified: true }));
    },

    async me(req: Request, res: Response): Promise<void> {
      if (!req.auth) {
        throw new UnauthorizedError();
      }
      const user = await authService.getCurrentUser(req.auth.userId);
      res
        .status(200)
        .json(
          apiSuccess({
            ...user,
            organizationId: req.auth.organizationId,
            role: req.auth.role,
            permissions: req.auth.permissions,
          }),
        );
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
