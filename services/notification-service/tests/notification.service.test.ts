import { describe, expect, it } from "vitest";
import { NotFoundError } from "@nexora/http";
import { createNotificationService } from "../src/services/notification.service.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG = "org_1";
const USER = "user_1";

const draft = {
  userId: USER,
  type: "TASK_ASSIGNED",
  title: "New task",
  body: "You were assigned a task",
  metadata: { taskId: "task_1" },
};

describe("createNotification and listing", () => {
  it("creates a notification and lists it for its recipient", async () => {
    const prisma = createFakePrisma();
    const service = createNotificationService({ prisma });
    await service.createNotification(ORG, draft);

    const result = await service.listMyNotifications(ORG, USER, { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
  });

  it("does not return another user's notifications", async () => {
    const prisma = createFakePrisma();
    const service = createNotificationService({ prisma });
    await service.createNotification(ORG, draft);
    await service.createNotification(ORG, { ...draft, userId: "user_2" });

    const result = await service.listMyNotifications(ORG, USER, { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
  });

  it("does not return another organization's notifications even for the same userId", async () => {
    const prisma = createFakePrisma();
    const service = createNotificationService({ prisma });
    await service.createNotification(ORG, draft);
    await service.createNotification("org_2", draft);

    const result = await service.listMyNotifications(ORG, USER, { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
  });

  it("filters by isRead", async () => {
    const prisma = createFakePrisma();
    const service = createNotificationService({ prisma });
    const n1 = await service.createNotification(ORG, draft);
    await service.createNotification(ORG, draft);
    await service.markAsRead(ORG, USER, n1.id);

    const unread = await service.listMyNotifications(ORG, USER, {
      page: 1,
      pageSize: 20,
      isRead: false,
    });
    expect(unread.data).toHaveLength(1);
  });
});

describe("getUnreadCount", () => {
  it("reflects real data, not a stored counter", async () => {
    const prisma = createFakePrisma();
    const service = createNotificationService({ prisma });
    await service.createNotification(ORG, draft);
    await service.createNotification(ORG, draft);
    expect(await service.getUnreadCount(ORG, USER)).toBe(2);

    const [n1] = (await service.listMyNotifications(ORG, USER, { page: 1, pageSize: 20 }))
      .data as Array<{ id: string }>;
    await service.markAsRead(ORG, USER, n1!.id);
    expect(await service.getUnreadCount(ORG, USER)).toBe(1);
  });
});

describe("markAsRead", () => {
  it("sets isRead and readAt", async () => {
    const prisma = createFakePrisma();
    const fixedNow = new Date("2026-03-01T00:00:00Z");
    const service = createNotificationService({ prisma, now: () => fixedNow });
    const notification = await service.createNotification(ORG, draft);

    const updated = await service.markAsRead(ORG, USER, notification.id);
    expect((updated as { isRead: boolean }).isRead).toBe(true);
    expect((updated as { readAt: Date }).readAt).toEqual(fixedNow);
  });

  it("refuses to mark another user's notification as read", async () => {
    const prisma = createFakePrisma();
    const service = createNotificationService({ prisma });
    const notification = await service.createNotification(ORG, draft);

    await expect(service.markAsRead(ORG, "someone_else", notification.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("markAllAsRead", () => {
  it("marks only the caller's own unread notifications, returning the count", async () => {
    const prisma = createFakePrisma();
    const service = createNotificationService({ prisma });
    await service.createNotification(ORG, draft);
    await service.createNotification(ORG, draft);
    await service.createNotification(ORG, { ...draft, userId: "user_2" }); // must not be affected

    const count = await service.markAllAsRead(ORG, USER);
    expect(count).toBe(2);
    expect(await service.getUnreadCount(ORG, USER)).toBe(0);
    expect(await service.getUnreadCount(ORG, "user_2")).toBe(1);
  });
});
