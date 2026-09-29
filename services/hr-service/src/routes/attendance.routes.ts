import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, requirePermission, validateQuery, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import { paginationQuerySchema } from "@nexora/validation";
import type { AttendanceService } from "../services/attendance.service.js";
import {
  listAttendanceQuerySchema,
  type ListAttendanceQuery,
} from "../validation/attendance.schemas.js";

export function createAttendanceRouter(
  attendanceService: AttendanceService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);

  router.post(
    "/clock-in",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const record = await attendanceService.clockIn(req.auth.organizationId, req.auth.userId);
      res.status(201).json(apiSuccess(record));
    }),
  );

  router.post(
    "/clock-out",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const record = await attendanceService.clockOut(req.auth.organizationId, req.auth.userId);
      res.status(200).json(apiSuccess(record));
    }),
  );

  router.get(
    "/me",
    requireAuth,
    validateQuery(paginationQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (req as Request & { validatedQuery: { page: number; pageSize: number } })
        .validatedQuery;
      const result = await attendanceService.listMyAttendance(
        req.auth.organizationId,
        req.auth.userId,
        query,
      );
      res.status(200).json(apiSuccess(result));
    }),
  );

  router.get(
    "/",
    requireAuth,
    requirePermission("attendance.read"),
    validateQuery(listAttendanceQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (req as Request & { validatedQuery: ListAttendanceQuery }).validatedQuery;
      const result = await attendanceService.listAttendance(
        req.auth.organizationId,
        req.auth.permissions.includes("attendance.manage")
          ? query
          : { ...query, employeeId: req.auth.userId },
      );
      res.status(200).json(apiSuccess(result));
    }),
  );

  return router;
}
