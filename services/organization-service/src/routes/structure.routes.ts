import { routeId } from "@nexora/http";
import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, requirePermission, validateBody, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { StructureService } from "../services/structure.service.js";
import {
  createDepartmentSchema,
  createTeamSchema,
  updateDepartmentSchema,
  updateTeamSchema,
} from "../validation/structure.schemas.js";
export function createStructureRouter(
  structureService: StructureService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireManage = requirePermission("organization.manage");
  router.get(
    "/departments",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      res
        .status(200)
        .json(apiSuccess(await structureService.listDepartments(req.auth.organizationId)));
    }),
  );
  router.post(
    "/departments",
    requireAuth,
    requireManage,
    validateBody(createDepartmentSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const department = await structureService.createDepartment(req.auth.organizationId, req.body);
      res.status(201).json(apiSuccess(department));
    }),
  );
  router.patch(
    "/departments/:id",
    requireAuth,
    requireManage,
    validateBody(updateDepartmentSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const department = await structureService.updateDepartment(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(department));
    }),
  );
  router.delete(
    "/departments/:id",
    requireAuth,
    requireManage,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      await structureService.deleteDepartment(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess({ deleted: true }));
    }),
  );
  router.get(
    "/teams",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      res.status(200).json(apiSuccess(await structureService.listTeams(req.auth.organizationId)));
    }),
  );
  router.post(
    "/teams",
    requireAuth,
    requireManage,
    validateBody(createTeamSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const team = await structureService.createTeam(req.auth.organizationId, req.body);
      res.status(201).json(apiSuccess(team));
    }),
  );
  router.patch(
    "/teams/:id",
    requireAuth,
    requireManage,
    validateBody(updateTeamSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const team = await structureService.updateTeam(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(team));
    }),
  );
  router.delete(
    "/teams/:id",
    requireAuth,
    requireManage,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      await structureService.deleteTeam(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess({ deleted: true }));
    }),
  );
  return router;
}
