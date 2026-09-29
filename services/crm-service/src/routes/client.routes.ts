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
import type { ClientService } from "../services/client.service.js";
import {
  createClientSchema,
  createContactSchema,
  listClientsQuerySchema,
  updateClientSchema,
  type ListClientsQuery,
} from "../validation/client.schemas.js";
export function createClientRouter(
  clientService: ClientService,
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
    validateBody(createClientSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const client = await clientService.createClient(req.auth.organizationId, req.body);
      res.status(201).json(apiSuccess(client));
    }),
  );
  router.get(
    "/",
    requireAuth,
    requireRead,
    validateQuery(listClientsQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListClientsQuery;
        }
      ).validatedQuery;
      const result = await clientService.listClients(req.auth.organizationId, query);
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const client = await clientService.getClientOrThrow(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(client));
    }),
  );
  router.patch(
    "/:id",
    requireAuth,
    requireManage,
    validateBody(updateClientSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const client = await clientService.updateClient(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(client));
    }),
  );
  router.get(
    "/:id/contacts",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const contacts = await clientService.listContacts(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(contacts));
    }),
  );
  router.post(
    "/:id/contacts",
    requireAuth,
    requireManage,
    validateBody(createContactSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const contact = await clientService.addContact(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(201).json(apiSuccess(contact));
    }),
  );
  return router;
}
