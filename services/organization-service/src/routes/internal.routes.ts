import type { Request, Response } from "express";
import { Router } from "express";
import { asyncHandler } from "@nexora/utils";
import { internalServiceAuth, validateBody } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { OrganizationService } from "../services/organization.service.js";
import type { InvitationService } from "../services/invitation.service.js";
import {
  bootstrapOrganizationSchema,
  consumeInvitationSchema,
  membershipLookupSchema,
  validateInvitationTokenSchema,
} from "../validation/internal.schemas.js";

export function createInternalRouter(
  organizationService: OrganizationService,
  invitationService: InvitationService,
  internalSecret: string,
): Router {
  const router = Router();
  router.use(internalServiceAuth(internalSecret));

  router.post(
    "/organizations/bootstrap",
    validateBody(bootstrapOrganizationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await organizationService.bootstrapOrganization(req.body);
      res.status(201).json(apiSuccess(result));
    }),
  );

  router.post(
    "/memberships/lookup",
    validateBody(membershipLookupSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await organizationService.lookupActiveMembership(req.body);
      res.status(200).json(apiSuccess(result));
    }),
  );

  router.post(
    "/invitations/validate",
    validateBody(validateInvitationTokenSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await invitationService.validateInvitationToken(req.body);
      res.status(200).json(apiSuccess(result));
    }),
  );

  router.post(
    "/invitations/consume",
    validateBody(consumeInvitationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await invitationService.consumeInvitation(req.body);
      res.status(200).json(apiSuccess(result));
    }),
  );

  return router;
}
