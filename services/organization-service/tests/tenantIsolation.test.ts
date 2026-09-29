import { describe, expect, it } from "vitest";
import { NotFoundError } from "@nexora/http";
import { createStructureService } from "../src/services/structure.service.js";
import { createMembershipService } from "../src/services/membership.service.js";
import { createInvitationService } from "../src/services/invitation.service.js";
import { createCapturingPublisher } from "./fakeEventPublisher.js";
import { createFakePrisma } from "./fakePrisma.js";
import { createCapturingAuditClient } from "./fakeAuditClient.js";

const ACTOR = "user_actor";

/**
 * These tests exist because build spec section 5 requires it explicitly:
 * "Company A must NEVER be able to access Company B's information... Write
 * automated tests specifically for tenant isolation." Every service
 * function under test here scopes its query by organizationId in the
 * WHERE clause itself (see structure.service.ts / membership.service.ts),
 * not via a post-fetch check - these tests confirm that actually holds.
 */

async function setupTwoOrgs() {
  const prisma = createFakePrisma();
  const orgA = await prisma.organization.create({ data: { name: "Org A", slug: "org-a" } });
  const orgB = await prisma.organization.create({ data: { name: "Org B", slug: "org-b" } });
  return { prisma, orgA, orgB };
}

describe("tenant isolation - departments and teams", () => {
  it("Org A cannot update Org B's department, even knowing its id", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    const structureService = createStructureService({ prisma });

    const orgBDepartment = await structureService.createDepartment(orgB.id, {
      name: "Engineering",
    });

    await expect(
      structureService.updateDepartment(orgA.id, orgBDepartment.id, { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Confirm it genuinely wasn't touched, not just that the call errored.
    const stillOrgBList = await structureService.listDepartments(orgB.id);
    expect(stillOrgBList[0]?.name).toBe("Engineering");
  });

  it("Org A cannot delete Org B's department", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    const structureService = createStructureService({ prisma });

    const orgBDepartment = await structureService.createDepartment(orgB.id, { name: "Finance" });

    await expect(
      structureService.deleteDepartment(orgA.id, orgBDepartment.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stillThere = await structureService.listDepartments(orgB.id);
    expect(stillThere).toHaveLength(1);
  });

  it("listing departments/teams never returns another org's rows", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    const structureService = createStructureService({ prisma });

    await structureService.createDepartment(orgA.id, { name: "Sales" });
    await structureService.createDepartment(orgB.id, { name: "Sales" }); // same name, different org - must be allowed
    await structureService.createTeam(orgA.id, { name: "Outbound" });
    await structureService.createTeam(orgB.id, { name: "Outbound" });

    const orgADepartments = await structureService.listDepartments(orgA.id);
    const orgBDepartments = await structureService.listDepartments(orgB.id);
    expect(orgADepartments).toHaveLength(1);
    expect(orgBDepartments).toHaveLength(1);
    expect(orgADepartments[0]?.id).not.toBe(orgBDepartments[0]?.id);

    const orgATeams = await structureService.listTeams(orgA.id);
    expect(orgATeams).toHaveLength(1);
  });

  it("Org A cannot attach a team to Org B's department by guessing its id", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    const structureService = createStructureService({ prisma });

    const orgBDepartment = await structureService.createDepartment(orgB.id, { name: "Legal" });

    await expect(
      structureService.createTeam(orgA.id, { name: "Contracts", departmentId: orgBDepartment.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("tenant isolation - memberships", () => {
  it("Org A's membership list never includes Org B's members", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    await prisma.membership.create({
      data: { organizationId: orgA.id, userId: "user_a1", role: "OWNER", status: "ACTIVE" },
    });
    await prisma.membership.create({
      data: { organizationId: orgB.id, userId: "user_b1", role: "OWNER", status: "ACTIVE" },
    });
    const membershipService = createMembershipService({
      prisma,
      auditClient: createCapturingAuditClient(),
    });

    const orgAMembers = await membershipService.listMemberships(orgA.id);
    expect(orgAMembers).toHaveLength(1);
    expect(orgAMembers[0]?.userId).toBe("user_a1");
  });

  it("Org A cannot change the role of an Org B membership by id", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    await prisma.membership.create({
      data: { organizationId: orgB.id, userId: "user_b_owner", role: "OWNER", status: "ACTIVE" },
    });
    const orgBEmployee = await prisma.membership.create({
      data: { organizationId: orgB.id, userId: "user_b2", role: "EMPLOYEE", status: "ACTIVE" },
    });
    const membershipService = createMembershipService({
      prisma,
      auditClient: createCapturingAuditClient(),
    });

    await expect(
      membershipService.updateMembershipRole(orgA.id, ACTOR, orgBEmployee.id, { role: "ADMIN" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Org A cannot remove an Org B member by id", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    const orgBEmployee = await prisma.membership.create({
      data: { organizationId: orgB.id, userId: "user_b3", role: "EMPLOYEE", status: "ACTIVE" },
    });
    const membershipService = createMembershipService({
      prisma,
      auditClient: createCapturingAuditClient(),
    });

    await expect(
      membershipService.removeMembership(orgA.id, ACTOR, orgBEmployee.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stillActive = await membershipService.listMemberships(orgB.id);
    expect(stillActive.some((m: { id: string }) => m.id === orgBEmployee.id)).toBe(true);
  });
});

describe("tenant isolation - invitations", () => {
  it("Org A cannot revoke an Org B invitation by id", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    const invitationService = createInvitationService({
      prisma,
      eventPublisher: createCapturingPublisher(),
    });

    const orgBInvitation = await invitationService.createInvitation(orgB.id, "user_b_owner", {
      email: "candidate@example.com",
      role: "EMPLOYEE",
    });

    await expect(
      invitationService.revokeInvitation(orgA.id, orgBInvitation.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stillPending = await invitationService.listInvitations(orgB.id);
    expect(stillPending).toHaveLength(1);
    void orgA;
  });

  it("listing invitations never leaks another org's pending invitations", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    const invitationService = createInvitationService({
      prisma,
      eventPublisher: createCapturingPublisher(),
    });

    await invitationService.createInvitation(orgA.id, "user_a_owner", {
      email: "a@example.com",
      role: "EMPLOYEE",
    });
    await invitationService.createInvitation(orgB.id, "user_b_owner", {
      email: "b@example.com",
      role: "EMPLOYEE",
    });

    const orgAInvitations = await invitationService.listInvitations(orgA.id);
    expect(orgAInvitations).toHaveLength(1);
    expect(orgAInvitations[0]?.email).toBe("a@example.com");
  });

  it("consuming a valid invitation only ever creates a membership in ITS OWN organization", async () => {
    const { prisma, orgA, orgB } = await setupTwoOrgs();
    const invitationService = createInvitationService({
      prisma,
      eventPublisher: createCapturingPublisher(),
    });

    let rawToken = "";
    const invitationServiceWithCapture = createInvitationService({
      prisma,
      eventPublisher: createCapturingPublisher(),
      onInvitationTokenIssued: (token) => {
        rawToken = token;
      },
    });
    const invitation = await invitationServiceWithCapture.createInvitation(
      orgB.id,
      "user_b_owner",
      {
        email: "newhire@example.com",
        role: "EMPLOYEE",
      },
    );

    const validated = await invitationService.validateInvitationToken({ token: rawToken });
    expect(validated.organizationId).toBe(orgB.id);

    const consumed = await invitationService.consumeInvitation({
      invitationId: invitation.id,
      userId: "new_user_1",
    });
    expect(consumed.organizationId).toBe(orgB.id);

    const orgAMembers = await createMembershipService({
      prisma,
      auditClient: createCapturingAuditClient(),
    }).listMemberships(orgA.id);
    expect(orgAMembers.some((m: { userId: string }) => m.userId === "new_user_1")).toBe(false);
  });
});
