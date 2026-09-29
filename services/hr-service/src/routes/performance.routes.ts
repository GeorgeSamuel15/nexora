import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import {
  authenticate,
  requirePermission,
  routeId,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
} from "@nexora/http";
import { asyncHandler } from "@nexora/utils";
import { apiSuccess } from "@nexora/types";
import { paginationQuerySchema } from "@nexora/validation";
import type { TokenConfig } from "@nexora/auth";
import type { PrismaClient } from "../../generated/client/index.js";
const schema = z.object({
  employeeId: z.string().uuid(),
  period: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().min(1).max(10000),
  goals: z.string().min(1).max(10000),
});
export function performanceRouter(
  db: PrismaClient,
  config: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  router.use(authenticate(config));
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const { page, pageSize } = paginationQuerySchema.parse(req.query);
      const where = {
        organizationId: req.auth.organizationId,
        ...(req.auth.permissions.includes("employee.update")
          ? {}
          : { employeeId: req.auth.userId, status: "SUBMITTED" }),
      };
      const [data, total] = await Promise.all([
        db.performanceReview.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        db.performanceReview.count({ where }),
      ]);
      res.json(
        apiSuccess({
          data,
          pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        }),
      );
    }),
  );
  router.post(
    "/",
    requirePermission("employee.update"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const input = schema.parse(req.body);
      // Verify the reference with the owning organization service before writing.
      const response = await fetch(
        `${process.env.ORGANIZATION_SERVICE_INTERNAL_URL ?? "http://localhost:4002"}/internal/memberships/lookup`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-secret": process.env.INTERNAL_SERVICE_SECRET ?? "",
          },
          body: JSON.stringify({ userId: input.employeeId }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) throw new NotFoundError("Active employee membership");
      const membership = (await response.json()) as { data: { organizationId: string } };
      if (membership.data.organizationId !== req.auth.organizationId)
        throw new NotFoundError("Active employee membership");
      res
        .status(201)
        .json(
          apiSuccess(
            await db.performanceReview.create({
              data: {
                ...input,
                organizationId: req.auth.organizationId,
                reviewerId: req.auth.userId,
              },
            }),
          ),
        );
    }),
  );
  router.patch(
    "/:id",
    requirePermission("employee.update"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const input = schema.omit({ employeeId: true }).parse(req.body);
      const result = await db.performanceReview.updateMany({
        where: {
          id: routeId(req),
          organizationId: req.auth.organizationId,
          reviewerId: req.auth.userId,
          status: "DRAFT",
        },
        data: input,
      });
      if (!result.count) throw new ConflictError("Only your draft reviews can be edited.");
      res.json(apiSuccess({ updated: true }));
    }),
  );
  router.post(
    "/:id/submit",
    requirePermission("employee.update"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const result = await db.performanceReview.updateMany({
        where: {
          id: routeId(req),
          organizationId: req.auth.organizationId,
          reviewerId: req.auth.userId,
          status: "DRAFT",
        },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
      if (!result.count) throw new ConflictError("Only your draft reviews can be submitted.");
      res.json(apiSuccess({ submitted: true }));
    }),
  );
  return router;
}
