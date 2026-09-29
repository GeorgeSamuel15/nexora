import { routeId } from "@nexora/http";
import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import {
  authenticate,
  requirePermission,
  validateBody,
  validateQuery,
  UnauthorizedError,
} from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { LeadService } from "../services/lead.service.js";
import {
  createLeadSchema,
  listLeadsQuerySchema,
  updateLeadSchema,
  type ListLeadsQuery,
} from "../validation/lead.schemas.js";
export function createLeadRouter(
  leadService: LeadService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireManage = requirePermission("crm.manage");
  const requireRead = requirePermission("crm.read");
  router.post(
    "/",
    requireAuth,
    requireManage,
    validateBody(createLeadSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const lead = await leadService.createLead(req.auth.organizationId, req.body);
      res.status(201).json(apiSuccess(lead));
    }),
  );
  router.get(
    "/",
    requireAuth,
    requireRead,
    validateQuery(listLeadsQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListLeadsQuery;
        }
      ).validatedQuery;
      const result = await leadService.listLeads(req.auth.organizationId, query);
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const lead = await leadService.getLeadOrThrow(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess(lead));
    }),
  );
  router.patch(
    "/:id",
    requireAuth,
    requireManage,
    validateBody(updateLeadSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const lead = await leadService.updateLead(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(lead));
    }),
  );
  router.post(
    "/:id/convert",
    requireAuth,
    requireManage,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const lead = await leadService.convertLead(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess(lead));
    }),
  );
  return router;
}
