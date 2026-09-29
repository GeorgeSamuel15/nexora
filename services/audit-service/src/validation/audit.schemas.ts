import { z } from "zod";
import { buildListQuerySchema, nonEmptyString } from "@nexora/validation";

export const listAuditLogsQuerySchema = buildListQuerySchema({
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

/** Body shape for the internal recording endpoint - matches
 * @nexora/audit-client's AuditEntry. organizationId must be included in
 * the body (not derived from a session) because this is a
 * service-to-service call with no user JWT - the calling service is the
 * only party that knows which org the action belongs to. */
export const recordAuditEntrySchema = z.object({
  organizationId: nonEmptyString.max(100),
  actorId: nonEmptyString.max(100),
  action: nonEmptyString.max(100),
  entityType: nonEmptyString.max(50),
  entityId: nonEmptyString.max(100),
  ipAddress: z.string().trim().max(45).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type RecordAuditEntryInput = z.infer<typeof recordAuditEntrySchema>;
