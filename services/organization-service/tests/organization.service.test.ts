import { describe, expect, it } from "vitest";
import { NotFoundError } from "@nexora/http";
import { createOrganizationService } from "../src/services/organization.service.js";
import { createFakePrisma } from "./fakePrisma.js";

describe("bootstrapOrganization", () => {
  it("creates an organization with a slug and an OWNER membership", async () => {
    const prisma = createFakePrisma();
    const service = createOrganizationService({ prisma });

    const result = await service.bootstrapOrganization({
      organizationName: "Acme Inc",
      ownerUserId: "user_1",
      ownerEmail: "owner@acme.test",
      ownerFirstName: "Ada",
      ownerLastName: "Owner",
    });

    expect(result.role).toBe("OWNER");
    const org = await service.getOrganization(result.organizationId);
    expect(org.slug).toBe("acme-inc");
  });

  it("generates a different slug when the name collides with an existing organization", async () => {
    const prisma = createFakePrisma();
    const service = createOrganizationService({ prisma });

    const first = await service.bootstrapOrganization({
      organizationName: "Acme Inc",
      ownerUserId: "user_1",
      ownerEmail: "owner1@acme.test",
      ownerFirstName: "Ada",
      ownerLastName: "Owner",
    });
    const second = await service.bootstrapOrganization({
      organizationName: "Acme Inc",
      ownerUserId: "user_2",
      ownerEmail: "owner2@acme.test",
      ownerFirstName: "Bea",
      ownerLastName: "Owner",
    });

    const firstOrg = await service.getOrganization(first.organizationId);
    const secondOrg = await service.getOrganization(second.organizationId);
    expect(firstOrg.slug).not.toBe(secondOrg.slug);
  });
});

describe("lookupActiveMembership", () => {
  it("returns the organization and role for a user's active membership", async () => {
    const prisma = createFakePrisma();
    const service = createOrganizationService({ prisma });

    const bootstrap = await service.bootstrapOrganization({
      organizationName: "Acme Inc",
      ownerUserId: "user_1",
      ownerEmail: "owner@acme.test",
      ownerFirstName: "Ada",
      ownerLastName: "Owner",
    });

    const membership = await service.lookupActiveMembership({ userId: "user_1" });
    expect(membership).toEqual({ organizationId: bootstrap.organizationId, role: "OWNER" });
  });

  it("throws NotFoundError for a user with no active membership", async () => {
    const prisma = createFakePrisma();
    const service = createOrganizationService({ prisma });

    await expect(service.lookupActiveMembership({ userId: "nobody" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("updateOrganization", () => {
  it("updates name and settings", async () => {
    const prisma = createFakePrisma();
    const service = createOrganizationService({ prisma });
    const bootstrap = await service.bootstrapOrganization({
      organizationName: "Acme Inc",
      ownerUserId: "user_1",
      ownerEmail: "owner@acme.test",
      ownerFirstName: "Ada",
      ownerLastName: "Owner",
    });

    const updated = await service.updateOrganization(bootstrap.organizationId, {
      name: "Acme Corp",
      settings: { timezone: "UTC" },
    });

    expect(updated.name).toBe("Acme Corp");
    expect(updated.settings).toEqual({ timezone: "UTC" });
  });

  it("404s cleanly for a non-existent organization", async () => {
    const prisma = createFakePrisma();
    const service = createOrganizationService({ prisma });
    await expect(
      service.updateOrganization("does-not-exist", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
