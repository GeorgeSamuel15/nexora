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
import type { ExpenseService } from "../services/expense.service.js";
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  type ListExpensesQuery,
} from "../validation/expense.schemas.js";
export function createExpenseRouter(
  expenseService: ExpenseService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireManage = requirePermission("finance.manage");
  const requireRead = requirePermission("finance.read");
  router.post(
    "/",
    requireAuth,
    validateBody(createExpenseSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const expense = await expenseService.submitExpense(
        req.auth.organizationId,
        req.auth.userId,
        req.body,
      );
      res.status(201).json(apiSuccess(expense));
    }),
  );
  router.get(
    "/",
    requireAuth,
    requireRead,
    validateQuery(listExpensesQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListExpensesQuery;
        }
      ).validatedQuery;
      const result = await expenseService.listExpenses(req.auth.organizationId, query);
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const expense = await expenseService.getExpenseOrThrow(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(expense));
    }),
  );
  router.post(
    "/:id/approve",
    requireAuth,
    requireManage,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const expense = await expenseService.reviewExpense(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
        "APPROVED",
      );
      res.status(200).json(apiSuccess(expense));
    }),
  );
  router.post(
    "/:id/reject",
    requireAuth,
    requireManage,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const expense = await expenseService.reviewExpense(
        req.auth.organizationId,
        routeId(req, "id"),
        req.auth.userId,
        "REJECTED",
      );
      res.status(200).json(apiSuccess(expense));
    }),
  );
  return router;
}
