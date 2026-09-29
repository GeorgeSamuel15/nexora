import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import {
  authenticate,
  requirePermission,
  routeId,
  UnauthorizedError,
  NotFoundError,
} from "@nexora/http";
import { asyncHandler, omitUndefined } from "@nexora/utils";
import { apiSuccess } from "@nexora/types";
import type { TokenConfig } from "@nexora/auth";
import type { PrismaClient } from "../../generated/client/index.js";
const schema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().max(1000).optional(),
  timezone: z
    .string()
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Invalid time zone")
    .default("UTC"),
});
export function branchRouter(
  db: PrismaClient,
  config: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  router.use(authenticate(config));
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      res.json(
        apiSuccess(
          await db.branch.findMany({
            where: { organizationId: req.auth.organizationId },
            orderBy: { name: "asc" },
          }),
        ),
      );
    }),
  );
  router.post(
    "/",
    requirePermission("organization.manage"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      res
        .status(201)
        .json(
          apiSuccess(
            await db.branch.create({
              data: {
                ...omitUndefined(schema.parse(req.body)),
                organizationId: req.auth.organizationId,
              },
            }),
          ),
        );
    }),
  );
  router.patch(
    "/:id",
    requirePermission("organization.manage"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const id = routeId(req);
      const organizationId = req.auth.organizationId;
      const result = await db.branch.updateMany({
        where: { id, organizationId },
        data: omitUndefined(schema.partial().parse(req.body)),
      });
      if (!result.count) throw new NotFoundError("Branch");
      res.json(apiSuccess(await db.branch.findFirst({ where: { id, organizationId } })));
    }),
  );
  router.delete(
    "/:id",
    requirePermission("organization.manage"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const result = await db.branch.deleteMany({
        where: { id: routeId(req), organizationId: req.auth.organizationId },
      });
      if (!result.count) throw new NotFoundError("Branch");
      res.json(apiSuccess({ deleted: true }));
    }),
  );
  return router;
}
