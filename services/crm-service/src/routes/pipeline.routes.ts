import { routeId } from "@nexora/http";
import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, requirePermission, validateBody, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { PipelineService } from "../services/pipeline.service.js";
import {
  createPipelineSchema,
  createStageSchema,
  updateStageSchema,
} from "../validation/pipeline.schemas.js";
export function createPipelineRouter(
  pipelineService: PipelineService,
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
    validateBody(createPipelineSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const pipeline = await pipelineService.createPipeline(req.auth.organizationId, req.body);
      res.status(201).json(apiSuccess(pipeline));
    }),
  );
  router.get(
    "/",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      res
        .status(200)
        .json(apiSuccess(await pipelineService.listPipelines(req.auth.organizationId)));
    }),
  );
  router.get(
    "/:id/board",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const board = await pipelineService.getPipelineBoard(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(board));
    }),
  );
  router.post(
    "/:id/stages",
    requireAuth,
    requireManage,
    validateBody(createStageSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const stage = await pipelineService.addStage(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(201).json(apiSuccess(stage));
    }),
  );
  router.patch(
    "/:id/stages/:stageId",
    requireAuth,
    requireManage,
    validateBody(updateStageSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const stage = await pipelineService.updateStage(
        req.auth.organizationId,
        routeId(req, "id"),
        routeId(req, "stageId"),
        req.body,
      );
      res.status(200).json(apiSuccess(stage));
    }),
  );
  return router;
}
