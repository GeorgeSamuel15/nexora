import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { DashboardService } from "../services/dashboard.service.js";

export function createDashboardRouter(
  dashboardService: DashboardService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);

  router.get(
    "/summary",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const summary = await dashboardService.getDashboardSummary(
        req.auth.organizationId,
        req.auth.permissions,
      );
      res.status(200).json(apiSuccess(summary));
    }),
  );

  return router;
}
