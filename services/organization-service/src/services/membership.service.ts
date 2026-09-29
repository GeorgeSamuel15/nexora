import { omitUndefined, toJsonObject } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import type { AuditClient } from "@nexora/audit-client";
import type { UpdateMembershipRoleInput } from "../validation/membership.schemas.js";
export interface MembershipServiceDeps {
  prisma: PrismaClient;
  auditClient: AuditClient;
}
export function createMembershipService(deps: MembershipServiceDeps) {
  const { prisma, auditClient } = deps;
  async function listMemberships(organizationId: string) {
    return prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
  }
  async function countActiveOwners(organizationId: string): Promise<number> {
    return prisma.membership.count({ where: { organizationId, role: "OWNER", status: "ACTIVE" } });
  }
  async function updateMembershipRole(
    organizationId: string,
    actorId: string,
    membershipId: string,
    input: UpdateMembershipRoleInput,
  ) {
    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId, status: "ACTIVE" },
    });
    if (!membership) {
      throw new NotFoundError("Membership");
    }
    if (membership.role === "OWNER" && (await countActiveOwners(organizationId)) <= 1) {
      throw new ConflictError("An organization must always have at least one OWNER.");
    }
    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: omitUndefined({ role: input.role }),
    });
    await auditClient.record({
      organizationId,
      actorId,
      action: "MEMBERSHIP_ROLE_CHANGED",
      entityType: "membership",
      entityId: membershipId,
      metadata: toJsonObject({
        from: membership.role,
        to: input.role,
        targetUserId: membership.userId,
      }),
    });
    return updated;
  }
  async function removeMembership(organizationId: string, actorId: string, membershipId: string) {
    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId, status: "ACTIVE" },
    });
    if (!membership) {
      throw new NotFoundError("Membership");
    }
    if (membership.role === "OWNER" && (await countActiveOwners(organizationId)) <= 1) {
      throw new ConflictError("An organization must always have at least one OWNER.");
    }
    await prisma.membership.update({
      where: { id: membershipId },
      data: omitUndefined({ status: "REMOVED" }),
    });
    await auditClient.record({
      organizationId,
      actorId,
      action: "MEMBERSHIP_REMOVED",
      entityType: "membership",
      entityId: membershipId,
      metadata: toJsonObject({ targetUserId: membership.userId, role: membership.role }),
    });
  }
  return { listMemberships, updateMembershipRole, removeMembership };
}
export type MembershipService = ReturnType<typeof createMembershipService>;
