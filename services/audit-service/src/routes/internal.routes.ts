import type { Request, Response } from "express";
import { Router } from "express";
import { asyncHandler } from "@nexora/utils";
import { internalServiceAuth, validateBody } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { AuditService } from "../services/audit.service.js";
import { recordAuditEntrySchema } from "../validation/audit.schemas.js";

export function createInternalRouter(auditService: AuditService, internalSecret: string): Router {
  const router = Router();
  router.use(internalServiceAuth(internalSecret));

  router.post(
    "/audit-logs",
    validateBody(recordAuditEntrySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const entry = await auditService.recordEntry(req.body);
      res.status(201).json(apiSuccess(entry));
    }),
  );

  return router;
}
