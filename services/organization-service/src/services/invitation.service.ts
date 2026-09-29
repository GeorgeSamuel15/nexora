import { omitUndefined } from "@nexora/utils";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { hashToken } from "@nexora/utils";
import { buildEvent, type EmployeeInvitedEvent, type EventPublisher } from "@nexora/events";
import type { CreateInvitationInput } from "../validation/invitation.schemas.js";
import type {
  ConsumeInvitationInput,
  ValidateInvitationTokenInput,
} from "../validation/internal.schemas.js";
const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export interface InvitationServiceDeps {
  prisma: PrismaClient;
  eventPublisher: EventPublisher;
  now?: () => Date;
  /** Test/dev hook to observe the raw token instead of guessing it - real
   * delivery is notification-service's job once Phase 10 wires up an
   * email provider; not faked here. */
  onInvitationTokenIssued?: (rawToken: string, email: string) => void | Promise<void>;
}
export function createInvitationService(deps: InvitationServiceDeps) {
  const { prisma, eventPublisher } = deps;
  const now = deps.now ?? (() => new Date());
  async function listInvitations(organizationId: string) {
    const invitations = await prisma.invitation.findMany({
      where: { organizationId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    return invitations.map(({ tokenHash: _tokenHash, ...invitation }) => {
      void _tokenHash;
      return invitation;
    });
  }
  async function createInvitation(
    organizationId: string,
    invitedBy: string,
    input: CreateInvitationInput,
  ) {
    // Note: we can only dedupe against other PENDING invitations for this
    // email here - checking whether the email already belongs to an
    // active member would require asking auth-service/user-service for
    // an extra hop that isn't worth it for a convenience check; a
    // duplicate real member just gets a redundant invitation they can
    // ignore, which is harmless.
    const existingInvitation = await prisma.invitation.findFirst({
      where: { organizationId, email: input.email, status: "PENDING" },
    });
    if (existingInvitation) {
      throw new ConflictError(`An invitation for ${input.email} is already pending.`);
    }
    const rawToken = randomBytes(32).toString("hex");
    const invitation = await prisma.invitation.create({
      data: omitUndefined({
        organizationId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(rawToken),
        invitedBy,
        expiresAt: new Date(now().getTime() + INVITATION_TOKEN_TTL_MS),
      }),
    });
    await deps.onInvitationTokenIssued?.(rawToken, input.email);
    await eventPublisher.publish(
      buildEvent<EmployeeInvitedEvent>("EMPLOYEE_INVITED", organizationId, {
        invitationId: invitation.id,
        email: invitation.email,
        invitedBy,
        role: invitation.role,
      }),
    );
    const { tokenHash: _tokenHash, ...safeInvitation } = invitation;
    void _tokenHash;
    return safeInvitation;
  }
  async function revokeInvitation(organizationId: string, invitationId: string) {
    const result = await prisma.invitation.updateMany({
      where: { id: invitationId, organizationId, status: "PENDING" },
      data: omitUndefined({ status: "REVOKED" }),
    });
    if (result.count === 0) {
      throw new NotFoundError("Pending invitation");
    }
  }
  /** Internal - called by auth-service BEFORE it creates the invitee's
   * auth User, so the account gets created with exactly this email. Does
   * NOT mark the invitation accepted (see consumeInvitation). */
  async function validateInvitationToken(input: ValidateInvitationTokenInput) {
    const tokenHash = hashToken(input.token);
    const invitation = await prisma.invitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < now()) {
      throw new NotFoundError("Valid invitation");
    }
    return {
      invitationId: invitation.id,
      email: invitation.email,
      organizationId: invitation.organizationId,
      role: invitation.role,
    };
  }
  /** Internal - called by auth-service AFTER it has created the invitee's
   * auth User. Atomically marks the invitation ACCEPTED and creates the
   * membership; guards against the same invitation being consumed twice
   * by a concurrent request (the updateMany's WHERE status: "PENDING"
   * only succeeds once). */
  async function consumeInvitation(input: ConsumeInvitationInput) {
    const invitation = await prisma.invitation.findUnique({ where: { id: input.invitationId } });
    if (!invitation) {
      throw new NotFoundError("Invitation");
    }
    const membership = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.invitation.updateMany({
        where: { id: invitation.id, status: "PENDING", expiresAt: { gt: now() } },
        data: { status: "ACCEPTED", acceptedAt: now() },
      });
      if (updateResult.count === 0)
        throw new ConflictError("This invitation has already been used or is no longer valid.");
      return tx.membership.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: input.userId,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId: input.userId,
          role: invitation.role,
          status: "ACTIVE",
        },
        update: { role: invitation.role, status: "ACTIVE" },
      });
    });
    return {
      organizationId: invitation.organizationId,
      role: invitation.role,
      membershipId: membership.id,
    };
  }
  return {
    listInvitations,
    createInvitation,
    revokeInvitation,
    validateInvitationToken,
    consumeInvitation,
  };
}
export type InvitationService = ReturnType<typeof createInvitationService>;
