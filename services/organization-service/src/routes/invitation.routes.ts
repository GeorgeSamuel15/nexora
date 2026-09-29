import { routeId } from "@nexora/http";
import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, requirePermission, validateBody, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { InvitationService } from "../services/invitation.service.js";
import { createInvitationSchema } from "../validation/invitation.schemas.js";
export function createInvitationRouter(
  invitationService: InvitationService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireManage = requirePermission("organization.manage");
  router.get(
    "/",
    requireAuth,
    requireManage,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      res
        .status(200)
        .json(apiSuccess(await invitationService.listInvitations(req.auth.organizationId)));
    }),
  );
  router.post(
    "/",
    requireAuth,
    requireManage,
    validateBody(createInvitationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const invitation = await invitationService.createInvitation(
        req.auth.organizationId,
        req.auth.userId,
        req.body,
      );
      res.status(201).json(apiSuccess(invitation));
    }),
  );
  router.delete(
    "/:id",
    requireAuth,
    requireManage,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      await invitationService.revokeInvitation(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess({ revoked: true }));
    }),
  );
  return router;
}
