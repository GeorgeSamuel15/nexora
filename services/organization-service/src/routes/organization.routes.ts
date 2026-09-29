import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, requirePermission, validateBody, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { OrganizationService } from "../services/organization.service.js";
import { updateOrganizationSchema } from "../validation/organization.schemas.js";

export function createOrganizationRouter(
  organizationService: OrganizationService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);

  router.get(
    "/me",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const organization = await organizationService.getOrganization(req.auth.organizationId);
      res.status(200).json(apiSuccess(organization));
    }),
  );

  router.patch(
    "/me",
    requireAuth,
    requirePermission("organization.manage"),
    validateBody(updateOrganizationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const organization = await organizationService.updateOrganization(
        req.auth.organizationId,
        req.body,
      );
      res.status(200).json(apiSuccess(organization));
    }),
  );

  return router;
}
