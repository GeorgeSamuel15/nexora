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
import type { InvoiceService } from "../services/invoice.service.js";
import type { PaymentService } from "../services/payment.service.js";
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  updateInvoiceItemsSchema,
  updateInvoiceSchema,
  type ListInvoicesQuery,
} from "../validation/invoice.schemas.js";
export function createInvoiceRouter(
  invoiceService: InvoiceService,
  paymentService: PaymentService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireCreate = requirePermission("invoice.create");
  const requireUpdate = requirePermission("invoice.update");
  const requireRead = requirePermission("finance.read");
  router.post(
    "/",
    requireAuth,
    requireCreate,
    validateBody(createInvoiceSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const invoice = await invoiceService.createInvoice(
        req.auth.organizationId,
        req.auth.userId,
        req.body,
      );
      res.status(201).json(apiSuccess(invoice));
    }),
  );
  router.get(
    "/",
    requireAuth,
    requireRead,
    validateQuery(listInvoicesQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListInvoicesQuery;
        }
      ).validatedQuery;
      const result = await invoiceService.listInvoices(req.auth.organizationId, query);
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const invoice = await invoiceService.getInvoiceOrThrow(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(invoice));
    }),
  );
  router.patch(
    "/:id",
    requireAuth,
    requireUpdate,
    validateBody(updateInvoiceSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const invoice = await invoiceService.updateInvoice(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(invoice));
    }),
  );
  router.put(
    "/:id/items",
    requireAuth,
    requireUpdate,
    validateBody(updateInvoiceItemsSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const invoice = await invoiceService.updateItems(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(invoice));
    }),
  );
  router.post(
    "/:id/send",
    requireAuth,
    requireUpdate,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const invoice = await invoiceService.sendInvoice(req.auth.organizationId, routeId(req, "id"));
      res.status(200).json(apiSuccess(invoice));
    }),
  );
  router.post(
    "/:id/cancel",
    requireAuth,
    requireUpdate,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const invoice = await invoiceService.cancelInvoice(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(invoice));
    }),
  );
  router.get(
    "/:id/payments",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const payments = await paymentService.listPaymentsForInvoice(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(payments));
    }),
  );
  return router;
}
