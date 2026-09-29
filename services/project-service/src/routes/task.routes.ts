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
import type { TaskService } from "../services/task.service.js";
import {
  assignTaskSchema,
  createCommentSchema,
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
  type ListTasksQuery,
} from "../validation/task.schemas.js";
export function createTaskRouter(
  taskService: TaskService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  router.post(
    "/",
    requireAuth,
    requirePermission("task.create"),
    validateBody(createTaskSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const task = await taskService.createTask(req.auth.organizationId, req.auth.userId, req.body);
      res.status(201).json(apiSuccess(task));
    }),
  );
  router.get(
    "/",
    requireAuth,
    requirePermission("task.read"),
    validateQuery(listTasksQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListTasksQuery;
        }
      ).validatedQuery;
      const result = await taskService.listTasks(req.auth.organizationId, query);
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requirePermission("task.read"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const task = await taskService.getTaskOrThrow(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess(task));
    }),
  );
  router.patch(
    "/:id",
    requireAuth,
    requirePermission("task.update"),
    validateBody(updateTaskSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const task = await taskService.updateTask(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
        req.body,
      );
      res.status(200).json(apiSuccess(task));
    }),
  );
  router.patch(
    "/:id/assign",
    requireAuth,
    requirePermission("task.assign"),
    validateBody(assignTaskSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const task = await taskService.assignTask(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
        req.body,
      );
      res.status(200).json(apiSuccess(task));
    }),
  );
  router.post(
    "/:id/complete",
    requireAuth,
    requirePermission("task.update"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const task = await taskService.completeTask(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
      );
      res.status(200).json(apiSuccess(task));
    }),
  );
  router.get(
    "/:id/comments",
    requireAuth,
    requirePermission("task.read"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const comments = await taskService.listComments(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess(comments));
    }),
  );
  router.post(
    "/:id/comments",
    requireAuth,
    requirePermission("task.read"),
    validateBody(createCommentSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const comment = await taskService.addComment(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
        req.body,
      );
      res.status(201).json(apiSuccess(comment));
    }),
  );
  router.get(
    "/:id/activity",
    requireAuth,
    requirePermission("task.read"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const activity = await taskService.listActivity(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess(activity));
    }),
  );
  return router;
}
