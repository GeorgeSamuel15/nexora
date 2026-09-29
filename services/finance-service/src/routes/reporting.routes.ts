import { z } from "zod";
import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, requirePermission, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { ReportingService } from "../services/reporting.service.js";

export function createReportingRouter(
  reportingService: ReportingService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireRead = requirePermission("finance.read");

  router.get(
    "/summary",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const summary = await reportingService.getFinancialSummary(req.auth.organizationId, z.string().regex(/^[A-Z]{3}$/).default("USD").parse(req.query.currency));
      res.status(200).json(apiSuccess(summary));
    }),
  );

  return router;
}
