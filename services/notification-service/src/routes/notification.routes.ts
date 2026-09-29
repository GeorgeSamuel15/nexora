import { routeId } from "@nexora/http";
import type { Request, Response } from "express";
import { Router } from "express";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import { authenticate, UnauthorizedError, validateQuery } from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { NotificationService } from "../services/notification.service.js";
import {
  listNotificationsQuerySchema,
  type ListNotificationsQuery,
} from "../validation/notification.schemas.js";
export function createNotificationRouter(
  notificationService: NotificationService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  router.get(
    "/me",
    requireAuth,
    validateQuery(listNotificationsQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListNotificationsQuery;
        }
      ).validatedQuery;
      const result = await notificationService.listMyNotifications(
        req.auth.organizationId,
        req.auth.userId,
        query,
      );
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.get(
    "/me/unread-count",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const count = await notificationService.getUnreadCount(
        req.auth.organizationId,
        req.auth.userId,
      );
      res.status(200).json(apiSuccess({ count }));
    }),
  );
  router.post(
    "/:id/read",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const notification = await notificationService.markAsRead(
        req.auth.organizationId,
        req.auth.userId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(notification));
    }),
  );
  router.post(
    "/read-all",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const count = await notificationService.markAllAsRead(
        req.auth.organizationId,
        req.auth.userId,
      );
      res.status(200).json(apiSuccess({ markedRead: count }));
    }),
  );
  return router;
}
