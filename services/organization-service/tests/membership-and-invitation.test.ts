import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@nexora/http";
import { createMembershipService } from "../src/services/membership.service.js";
import { createInvitationService } from "../src/services/invitation.service.js";
import { createCapturingPublisher } from "./fakeEventPublisher.js";
import { createFakePrisma } from "./fakePrisma.js";
import { createCapturingAuditClient } from "./fakeAuditClient.js";

const ACTOR = "user_actor";

describe("last-OWNER protection", () => {
  it("refuses to demote the only OWNER", async () => {
    const prisma = createFakePrisma();
    const org = await prisma.organization.create({ data: { name: "Acme", slug: "acme" } });
    const owner = await prisma.membership.create({
      data: { organizationId: org.id, userId: "user_1", role: "OWNER", status: "ACTIVE" },
    });
    const service = createMembershipService({ prisma, auditClient: createCapturingAuditClient() });

    await expect(
      service.updateMembershipRole(org.id, ACTOR, owner.id, { role: "ADMIN" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to remove the only OWNER", async () => {
    const prisma = createFakePrisma();
    const org = await prisma.organization.create({ data: { name: "Acme", slug: "acme" } });
    const owner = await prisma.membership.create({
      data: { organizationId: org.id, userId: "user_1", role: "OWNER", status: "ACTIVE" },
    });
    const service = createMembershipService({ prisma, auditClient: createCapturingAuditClient() });

    await expect(service.removeMembership(org.id, ACTOR, owner.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("allows demoting an OWNER when a second OWNER exists", async () => {
    const prisma = createFakePrisma();
    const org = await prisma.organization.create({ data: { name: "Acme", slug: "acme" } });
    const owner1 = await prisma.membership.create({
      data: { organizationId: org.id, userId: "user_1", role: "OWNER", status: "ACTIVE" },
    });
    await prisma.membership.create({
      data: { organizationId: org.id, userId: "user_2", role: "OWNER", status: "ACTIVE" },
    });
    const service = createMembershipService({ prisma, auditClient: createCapturingAuditClient() });

    const updated = await service.updateMembershipRole(org.id, ACTOR, owner1.id, { role: "ADMIN" });
    expect(updated.role).toBe("ADMIN");
  });

  it("allows removing a non-OWNER member freely", async () => {
    const prisma = createFakePrisma();
    const org = await prisma.organization.create({ data: { name: "Acme", slug: "acme" } });
    await prisma.membership.create({
      data: { organizationId: org.id, userId: "owner", role: "OWNER", status: "ACTIVE" },
    });
    const employee = await prisma.membership.create({
      data: { organizationId: org.id, userId: "user_2", role: "EMPLOYEE", status: "ACTIVE" },
    });
    const service = createMembershipService({ prisma, auditClient: createCapturingAuditClient() });

    await service.removeMembership(org.id, ACTOR, employee.id);
    const list = await service.listMemberships(org.id);
    expect(list.find((m: { id: string }) => m.id === employee.id)).toBeUndefined();
  });

  it("404s for an unknown membership id", async () => {
    const prisma = createFakePrisma();
    const org = await prisma.organization.create({ data: { name: "Acme", slug: "acme" } });
    const service = createMembershipService({ prisma, auditClient: createCapturingAuditClient() });
    await expect(service.removeMembership(org.id, ACTOR, "does-not-exist")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("invitation validate + consume", () => {
  it("full happy path: create, validate (non-destructive), consume (creates membership)", async () => {
    const prisma = createFakePrisma();
    const org = await prisma.organization.create({ data: { name: "Acme", slug: "acme" } });

    let rawToken = "";
    const eventPublisher = createCapturingPublisher();
    const service = createInvitationService({
      prisma,
      eventPublisher,
      onInvitationTokenIssued: (token) => {
        rawToken = token;
      },
    });

    const invitation = await service.createInvitation(org.id, "inviter_user", {
      email: "newhire@acme.test",
      role: "EMPLOYEE",
    });

    expect(eventPublisher.events).toHaveLength(1);
    expect(eventPublisher.events[0]?.type).toBe("EMPLOYEE_INVITED");
    expect(eventPublisher.events[0]?.payload).toMatchObject({
      email: "newhire@acme.test",
      invitedBy: "inviter_user",
    });

    // Validating does NOT consume it - calling it twice is fine.
    const firstLook = await service.validateInvitationToken({ token: rawToken });
    const secondLook = await service.validateInvitationToken({ token: rawToken });
    expect(firstLook.email).toBe("newhire@acme.test");
    expect(secondLook.invitationId).toBe(invitation.id);

    const consumed = await service.consumeInvitation({
      invitationId: invitation.id,
      userId: "new_user",
    });
    expect(consumed.role).toBe("EMPLOYEE");
    expect(consumed.organizationId).toBe(org.id);

    // Consuming again must fail - it's already ACCEPTED.
    await expect(
      service.consumeInvitation({ invitationId: invitation.id, userId: "new_user" }),
    ).rejects.toBeInstanceOf(ConflictError);

    // And validating the (now-accepted) token should also fail.
    await expect(service.validateInvitationToken({ token: rawToken })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects an unknown token", async () => {
    const prisma = createFakePrisma();
    const service = createInvitationService({ prisma, eventPublisher: createCapturingPublisher() });
    await expect(
      service.validateInvitationToken({ token: "not-a-real-token" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a second pending invitation to the same email in the same org", async () => {
    const prisma = createFakePrisma();
    const org = await prisma.organization.create({ data: { name: "Acme", slug: "acme" } });
    const service = createInvitationService({ prisma, eventPublisher: createCapturingPublisher() });

    await service.createInvitation(org.id, "inviter", { email: "dup@acme.test", role: "EMPLOYEE" });
    await expect(
      service.createInvitation(org.id, "inviter", { email: "dup@acme.test", role: "ADMIN" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("revoking a pending invitation prevents it from being consumed later", async () => {
    const prisma = createFakePrisma();
    const org = await prisma.organization.create({ data: { name: "Acme", slug: "acme" } });
    let rawToken = "";
    const service = createInvitationService({
      prisma,
      eventPublisher: createCapturingPublisher(),
      onInvitationTokenIssued: (token) => {
        rawToken = token;
      },
    });

    const invitation = await service.createInvitation(org.id, "inviter", {
      email: "x@acme.test",
      role: "EMPLOYEE",
    });
    await service.revokeInvitation(org.id, invitation.id);

    await expect(service.validateInvitationToken({ token: rawToken })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
