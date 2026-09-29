import type { PrismaClient } from "../generated/client/index.js";

interface FakeNotification {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `notification_${idCounter}`;
}

export function createFakePrisma() {
  const notifications = new Map<string, FakeNotification>();

  const fake = {
    notification: {
      create: async ({
        data,
      }: {
        data: Pick<
          FakeNotification,
          "organizationId" | "userId" | "type" | "title" | "body" | "metadata"
        >;
      }) => {
        const notification: FakeNotification = {
          id: nextId(),
          isRead: false,
          readAt: null,
          createdAt: new Date(),
          ...data,
        };
        notifications.set(notification.id, notification);
        return notification;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        notifications.get(where.id) ?? null,
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: { organizationId: string; userId: string; isRead?: boolean };
        skip?: number;
        take?: number;
      }) =>
        [...notifications.values()]
          .filter(
            (n) =>
              n.organizationId === where.organizationId &&
              n.userId === where.userId &&
              (where.isRead === undefined || n.isRead === where.isRead),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: async ({
        where,
      }: {
        where: { organizationId: string; userId: string; isRead?: boolean };
      }) =>
        [...notifications.values()].filter(
          (n) =>
            n.organizationId === where.organizationId &&
            n.userId === where.userId &&
            (where.isRead === undefined || n.isRead === where.isRead),
        ).length,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; organizationId: string; userId: string; isRead?: boolean };
        data: Partial<FakeNotification>;
      }) => {
        let count = 0;
        for (const n of notifications.values()) {
          const matches =
            (where.id === undefined || n.id === where.id) &&
            n.organizationId === where.organizationId &&
            n.userId === where.userId &&
            (where.isRead === undefined || n.isRead === where.isRead);
          if (matches) {
            Object.assign(n, data);
            count += 1;
          }
        }
        return { count };
      },
    },
  };

  return fake as unknown as PrismaClient;
}
