import { Router } from "express";
import type { Redis } from "ioredis";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, rateLimit, validateBody } from "@nexora/http";
import type { AuthController } from "../controllers/auth.controller.js";
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../validation/auth.schemas.js";

export function createAuthRouter(
  controller: AuthController,
  deps: { redis: Redis; tokenConfig: TokenConfig },
): Router {
  const router = Router();
  const requireAuth = authenticate(deps.tokenConfig);

  const loginLimiter = rateLimit(deps.redis, {
    keyPrefix: "ratelimit:login",
    limit: 10,
    windowSeconds: 60,
  });
  const registerLimiter = rateLimit(deps.redis, {
    keyPrefix: "ratelimit:register",
    limit: 5,
    windowSeconds: 60,
  });
  const forgotPasswordLimiter = rateLimit(deps.redis, {
    keyPrefix: "ratelimit:forgot-password",
    limit: 5,
    windowSeconds: 60,
  });

  router.post(
    "/register",
    registerLimiter,
    validateBody(registerSchema),
    asyncHandler(controller.register),
  );
  router.post(
    "/accept-invitation",
    registerLimiter,
    validateBody(acceptInvitationSchema),
    asyncHandler(controller.acceptInvitation),
  );
  router.post("/login", loginLimiter, validateBody(loginSchema), asyncHandler(controller.login));
  router.post("/refresh", validateBody(refreshSchema), asyncHandler(controller.refresh));
  router.post("/logout", validateBody(logoutSchema), asyncHandler(controller.logout));
  router.post(
    "/forgot-password",
    forgotPasswordLimiter,
    validateBody(forgotPasswordSchema),
    asyncHandler(controller.forgotPassword),
  );
  router.post(
    "/reset-password",
    validateBody(resetPasswordSchema),
    asyncHandler(controller.resetPassword),
  );
  router.post(
    "/verify-email",
    validateBody(verifyEmailSchema),
    asyncHandler(controller.verifyEmail),
  );
  router.get("/me", requireAuth, asyncHandler(controller.me));

  return router;
}
