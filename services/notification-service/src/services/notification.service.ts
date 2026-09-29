import { toJsonObject, omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import type { PaginatedResult } from "@nexora/types";
import type { NotificationDraft } from "../eventMapper.js";
import type { ListNotificationsQuery } from "../validation/notification.schemas.js";
export interface NotificationServiceDeps {
  prisma: PrismaClient;
  now?: () => Date;
}
export function createNotificationService(deps: NotificationServiceDeps) {
  const { prisma } = deps;
  const now = deps.now ?? (() => new Date());
  /** Only called from the event consumer (src/consumer.ts) - there is no
   * public "create notification" HTTP endpoint, per the build spec's
   * event-driven notification architecture. */
  async function createNotification(
    organizationId: string,
    draft: NotificationDraft,
    deliveryKey?: string,
  ) {
    if (deliveryKey) {
      const preference = await prisma.notificationPreference.findUnique({
        where: { organizationId_userId: { organizationId, userId: draft.userId } },
      });
      if (preference?.inApp === false) return null;
      return prisma.notification.upsert({
        where: { deliveryKey },
        update: {},
        create: {
          organizationId,
          deliveryKey,
          userId: draft.userId,
          type: draft.type,
          title: draft.title,
          body: draft.body,
          metadata: toJsonObject(draft.metadata),
        },
      });
    }
    return prisma.notification.create({
      data: omitUndefined({
        organizationId,
        userId: draft.userId,
        type: draft.type,
        title: draft.title,
        body: draft.body,
        metadata: toJsonObject(draft.metadata),
      }),
    });
  }
  async function listMyNotifications(
    organizationId: string,
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      userId,
      ...(query.isRead !== undefined ? { isRead: query.isRead } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.notification.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  /** Real database count, per the build spec's explicit requirement:
   * "Unread count must be based on real database data." */
  async function getUnreadCount(organizationId: string, userId: string): Promise<number> {
    return prisma.notification.count({ where: { organizationId, userId, isRead: false } });
  }
  async function markAsRead(organizationId: string, userId: string, notificationId: string) {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, organizationId, userId },
      data: omitUndefined({ isRead: true, readAt: now() }),
    });
    if (result.count === 0) {
      throw new NotFoundError("Notification");
    }
    return prisma.notification.findUnique({ where: { id: notificationId } });
  }
  async function markAllAsRead(organizationId: string, userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { organizationId, userId, isRead: false },
      data: omitUndefined({ isRead: true, readAt: now() }),
    });
    return result.count;
  }
  return { createNotification, listMyNotifications, getUnreadCount, markAsRead, markAllAsRead };
}
export type NotificationService = ReturnType<typeof createNotificationService>;
