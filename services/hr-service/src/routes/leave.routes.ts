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
import { paginationQuerySchema } from "@nexora/validation";
import type { LeaveService } from "../services/leave.service.js";
import {
  createLeaveRequestSchema,
  createLeaveTypeSchema,
  listLeaveRequestsQuerySchema,
  rejectLeaveRequestSchema,
  updateLeaveTypeSchema,
  type ListLeaveRequestsQuery,
} from "../validation/leave.schemas.js";
const balancesQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export function createLeaveRouter(
  leaveService: LeaveService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  // ---- Leave types ----
  router.get(
    "/leave-types",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      res.status(200).json(apiSuccess(await leaveService.listLeaveTypes(req.auth.organizationId)));
    }),
  );
  router.post(
    "/leave-types",
    requireAuth,
    requirePermission("leave.configure"),
    validateBody(createLeaveTypeSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const leaveType = await leaveService.createLeaveType(req.auth.organizationId, req.body);
      res.status(201).json(apiSuccess(leaveType));
    }),
  );
  router.patch(
    "/leave-types/:id",
    requireAuth,
    requirePermission("leave.configure"),
    validateBody(updateLeaveTypeSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const leaveType = await leaveService.updateLeaveType(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(leaveType));
    }),
  );
  // ---- Balances ----
  router.get(
    "/leave-balances/me",
    requireAuth,
    validateQuery(balancesQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: {
            year?: number;
          };
        }
      ).validatedQuery;
      const year = query.year ?? new Date().getUTCFullYear();
      const balances = await leaveService.getMyBalances(
        req.auth.organizationId,
        req.auth.userId,
        year,
      );
      res.status(200).json(apiSuccess(balances));
    }),
  );
  // ---- Leave requests ----
  router.post(
    "/leave-requests",
    requireAuth,
    validateBody(createLeaveRequestSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const request = await leaveService.requestLeave(
        req.auth.organizationId,
        req.auth.userId,
        req.body,
      );
      res.status(201).json(apiSuccess(request));
    }),
  );
  router.get(
    "/leave-requests/me",
    requireAuth,
    validateQuery(paginationQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: {
            page: number;
            pageSize: number;
          };
        }
      ).validatedQuery;
      const result = await leaveService.listMyLeaveRequests(
        req.auth.organizationId,
        req.auth.userId,
        query,
      );
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.post(
    "/leave-requests/:id/cancel",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const request = await leaveService.cancelLeaveRequest(
        req.auth.organizationId,
        req.auth.userId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(request));
    }),
  );
  router.get(
    "/leave-requests",
    requireAuth,
    requirePermission("leave.read"),
    validateQuery(listLeaveRequestsQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListLeaveRequestsQuery;
        }
      ).validatedQuery;
      const result = await leaveService.listLeaveRequests(
        req.auth.organizationId,
        req.auth.permissions.includes("leave.approve")
          ? query
          : { ...query, employeeId: req.auth.userId },
      );
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.patch(
    "/leave-requests/:id/approve",
    requireAuth,
    requirePermission("leave.approve"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const request = await leaveService.approveLeaveRequest(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
      );
      res.status(200).json(apiSuccess(request));
    }),
  );
  router.patch(
    "/leave-requests/:id/reject",
    requireAuth,
    requirePermission("leave.reject"),
    validateBody(rejectLeaveRequestSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const request = await leaveService.rejectLeaveRequest(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
        req.body,
      );
      res.status(200).json(apiSuccess(request));
    }),
  );
  return router;
}
