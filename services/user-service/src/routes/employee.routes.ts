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
import type { EmployeeService } from "../services/employee.service.js";
import {
  createEmployeeSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from "../validation/employee.schemas.js";
export function createEmployeeRouter(
  employeeService: EmployeeService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  router.get(
    "/",
    requireAuth,
    requirePermission("employee.read"),
    validateQuery(listEmployeesQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ReturnType<typeof listEmployeesQuerySchema.parse>;
        }
      ).validatedQuery;
      const result = await employeeService.listEmployees(req.auth.organizationId, query);
      // Pagination metadata travels alongside the rows per build spec
      // section 28's { data, pagination } shape.
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.post(
    "/",
    requireAuth,
    requirePermission("employee.create"),
    validateBody(createEmployeeSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const employee = await employeeService.createEmployee(
        req.auth.organizationId,
        req.auth.userId,
        req.body,
      );
      res.status(201).json(apiSuccess(employee));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requirePermission("employee.read"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const employee = await employeeService.getEmployee(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(employee));
    }),
  );
  router.patch(
    "/:id",
    requireAuth,
    requirePermission("employee.update"),
    validateBody(updateEmployeeSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const employee = await employeeService.updateEmployee(
        req.auth.organizationId,
        req.auth.userId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(employee));
    }),
  );
  router.delete(
    "/:id",
    requireAuth,
    requirePermission("employee.delete"),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const employee = await employeeService.deactivateEmployee(
        req.auth.organizationId,
        req.auth.userId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(employee));
    }),
  );
  return router;
}
