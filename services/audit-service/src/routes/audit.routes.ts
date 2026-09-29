import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, requirePermission, validateQuery, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { AuditService } from "../services/audit.service.js";
import { listAuditLogsQuerySchema, type ListAuditLogsQuery } from "../validation/audit.schemas.js";

export function createAuditRouter(
  auditService: AuditService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireRead = requirePermission("audit.read");

  router.get(
    "/",
    requireAuth,
    requireRead,
    validateQuery(listAuditLogsQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (req as Request & { validatedQuery: ListAuditLogsQuery }).validatedQuery;
      const result = await auditService.listAuditLogs(req.auth.organizationId, query);
      res.status(200).json(apiSuccess(result));
    }),
  );

  return router;
}
