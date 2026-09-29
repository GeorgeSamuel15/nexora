import { routeId } from "@nexora/http";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
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
import type { DealService } from "../services/deal.service.js";
import {
  createDealSchema,
  listDealsQuerySchema,
  updateDealSchema,
  type ListDealsQuery,
} from "../validation/deal.schemas.js";
const loseDealSchema = z.object({ reason: z.string().trim().max(500).optional() });
export function createDealRouter(
  dealService: DealService,
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
    validateBody(createDealSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const deal = await dealService.createDeal(req.auth.organizationId, req.auth.userId, req.body);
      res.status(201).json(apiSuccess(deal));
    }),
  );
  router.get(
    "/",
    requireAuth,
    requireRead,
    validateQuery(listDealsQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListDealsQuery;
        }
      ).validatedQuery;
      const result = await dealService.listDeals(req.auth.organizationId, query);
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const deal = await dealService.getDealOrThrow(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess(deal));
    }),
  );
  router.patch(
    "/:id",
    requireAuth,
    requireManage,
    validateBody(updateDealSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const deal = await dealService.updateDeal(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
        req.body,
      );
      res.status(200).json(apiSuccess(deal));
    }),
  );
  router.post(
    "/:id/win",
    requireAuth,
    requireManage,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const deal = await dealService.winDeal(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
      );
      res.status(200).json(apiSuccess(deal));
    }),
  );
  router.post(
    "/:id/lose",
    requireAuth,
    requireManage,
    validateBody(loseDealSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const deal = await dealService.loseDeal(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
        req.body.reason,
      );
      res.status(200).json(apiSuccess(deal));
    }),
  );
  router.get(
    "/:id/activities",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const activities = await dealService.listActivities(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(activities));
    }),
  );
  return router;
}
