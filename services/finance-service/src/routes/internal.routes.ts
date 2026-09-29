import type { Request, Response } from "express";
import { Router } from "express";
import { asyncHandler } from "@nexora/utils";
import { internalServiceAuth, ValidationError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { ReportingService } from "../services/reporting.service.js";

export function createInternalRouter(
  reportingService: ReportingService,
  internalSecret: string,
): Router {
  const router = Router();
  router.use(internalServiceAuth(internalSecret));

  router.get(
    "/stats",
    asyncHandler(async (req: Request, res: Response) => {
      const organizationId = req.query.organizationId;
      if (typeof organizationId !== "string" || !organizationId) {
        throw new ValidationError("organizationId query parameter is required.");
      }
      const stats = await reportingService.getDashboardStats(organizationId);
      res.status(200).json(apiSuccess(stats));
    }),
  );

  return router;
}
