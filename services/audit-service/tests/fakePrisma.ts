import type { PrismaClient } from "../generated/client/index.js";

interface FakeAuditLog {
  id: string;
  organizationId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `audit_${idCounter}`;
}

export function createFakePrisma() {
  const logs = new Map<string, FakeAuditLog>();

  const fake = {
    auditLog: {
      create: async ({
        data,
      }: {
        data: Pick<
          FakeAuditLog,
          "organizationId" | "actorId" | "action" | "entityType" | "entityId"
        > &
          Partial<FakeAuditLog>;
      }) => {
        const log: FakeAuditLog = {
          id: nextId(),
          ipAddress: null,
          metadata: {},
          createdAt: new Date(),
          ...data,
        };
        logs.set(log.id, log);
        return log;
      },
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: {
          organizationId: string;
          actorId?: string;
          entityType?: string;
          entityId?: string;
          action?: string;
        };
        skip?: number;
        take?: number;
      }) =>
        [...logs.values()]
          .filter(
            (l) =>
              l.organizationId === where.organizationId &&
              (where.actorId === undefined || l.actorId === where.actorId) &&
              (where.entityType === undefined || l.entityType === where.entityType) &&
              (where.entityId === undefined || l.entityId === where.entityId) &&
              (where.action === undefined || l.action === where.action),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: async ({
        where,
      }: {
        where: {
          organizationId: string;
          actorId?: string;
          entityType?: string;
          entityId?: string;
          action?: string;
        };
      }) =>
        [...logs.values()].filter(
          (l) =>
            l.organizationId === where.organizationId &&
            (where.actorId === undefined || l.actorId === where.actorId) &&
            (where.entityType === undefined || l.entityType === where.entityType) &&
            (where.entityId === undefined || l.entityId === where.entityId) &&
            (where.action === undefined || l.action === where.action),
        ).length,
    },
  };

  return fake as unknown as PrismaClient;
}
