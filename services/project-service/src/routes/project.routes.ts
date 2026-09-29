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
import type { ProjectService } from "../services/project.service.js";
import {
  addProjectMemberSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  type ListProjectsQuery,
} from "../validation/project.schemas.js";
export function createProjectRouter(
  projectService: ProjectService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  router.post(
    "/",
    requireAuth,
    requirePermission("project.create"),
    validateBody(createProjectSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const project = await projectService.createProject(req.auth.organizationId, req.body);
      res.status(201).json(apiSuccess(project));
    }),
  );
  router.get(
    "/",
    requireAuth,
    requirePermission("project.read"),
    validateQuery(listProjectsQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListProjectsQuery;
        }
      ).validatedQuery;
      const result = await projectService.listProjects(req.auth.organizationId, query);
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requirePermission("project.read"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const project = await projectService.getProject(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess(project));
    }),
  );
  router.patch(
    "/:id",
    requireAuth,
    requirePermission("project.update"),
    validateBody(updateProjectSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const project = await projectService.updateProject(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(project));
    }),
  );
  router.delete(
    "/:id",
    requireAuth,
    requirePermission("project.delete"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const project = await projectService.archiveProject(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(project));
    }),
  );
  router.get(
    "/:id/members",
    requireAuth,
    requirePermission("project.read"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const members = await projectService.listMembers(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess(members));
    }),
  );
  router.post(
    "/:id/members",
    requireAuth,
    requirePermission("project.update"),
    validateBody(addProjectMemberSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const member = await projectService.addMember(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(201).json(apiSuccess(member));
    }),
  );
  router.delete(
    "/:id/members/:userId",
    requireAuth,
    requirePermission("project.update"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      await projectService.removeMember(
        req.auth.organizationId,
        routeId(req, "id"),
        routeId(req, "userId"),
      );
      res.status(200).json(apiSuccess({ removed: true }));
    }),
  );
  return router;
}
