import type { Request, Response } from "express";
import { paginationQuerySchema } from "@nexora/validation";
import { routeId } from "@nexora/http";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, requirePermission, validateBody, UnauthorizedError } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { PaymentService } from "../services/payment.service.js";
import { createPaymentSchema } from "../validation/payment.schemas.js";
export function createPaymentRouter(
  paymentService: PaymentService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireCreate = requirePermission("payment.create");
  const requireRead = requirePermission("finance.read");
  router.get(
    "/",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const { page, pageSize } = paginationQuerySchema.parse(req.query);
      res.json(
        apiSuccess(await paymentService.listPayments(req.auth.organizationId, page, pageSize)),
      );
    }),
  );
  router.post(
    "/",
    requireAuth,
    requireCreate,
    validateBody(createPaymentSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const payment = await paymentService.recordPayment(
        req.auth.organizationId,
        req.auth.userId,
        req.body,
      );
      res.status(201).json(apiSuccess(payment));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const payment = await paymentService.getPaymentOrThrow(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(payment));
    }),
  );
  return router;
}
