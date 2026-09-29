import { routeId } from "@nexora/http";
import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, requirePermission, validateBody, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { MembershipService } from "../services/membership.service.js";
import { updateMembershipRoleSchema } from "../validation/membership.schemas.js";
export function createMembershipRouter(
  membershipService: MembershipService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireManage = requirePermission("organization.manage");
  router.get(
    "/",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      res
        .status(200)
        .json(apiSuccess(await membershipService.listMemberships(req.auth.organizationId)));
    }),
  );
  router.patch(
    "/:id",
    requireAuth,
    requireManage,
    validateBody(updateMembershipRoleSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const membership = await membershipService.updateMembershipRole(
        req.auth.organizationId,
        req.auth.userId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(membership));
    }),
  );
  router.delete(
    "/:id",
    requireAuth,
    requireManage,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      await membershipService.removeMembership(
        req.auth.organizationId,
        req.auth.userId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess({ removed: true }));
    }),
  );
  return router;
}
