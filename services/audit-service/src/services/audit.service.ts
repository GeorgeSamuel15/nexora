import { toJsonObject, omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import type { PaginatedResult } from "@nexora/types";
import type { AuditEntry } from "@nexora/audit-client";
import type { ListAuditLogsQuery } from "../validation/audit.schemas.js";
export interface AuditServiceDeps {
  prisma: PrismaClient;
}
export function createAuditService(deps: AuditServiceDeps) {
  const { prisma } = deps;
  /** The only way an AuditLog row is created - never edited or deleted
   * afterward (an audit trail that can be altered isn't one). Called
   * from both the internal HTTP endpoint (direct calls from services -
   * see internal.routes.ts) and the RabbitMQ consumer (existing domain
   * events - see consumer.ts). */
  async function recordEntry(entry: AuditEntry) {
    return prisma.auditLog.create({
      data: omitUndefined({
        organizationId: entry.organizationId,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: entry.ipAddress,
        metadata: toJsonObject(entry.metadata ?? {}),
      }),
    });
  }
  async function listAuditLogs(
    organizationId: string,
    query: ListAuditLogsQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  return { recordEntry, listAuditLogs };
}
export type AuditService = ReturnType<typeof createAuditService>;
