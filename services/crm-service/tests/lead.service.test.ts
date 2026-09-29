import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@nexora/http";
import { createClientService } from "../src/services/client.service.js";
import { createLeadService } from "../src/services/lead.service.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG = "org_1";
const OWNER = "user_owner";

function setup(prisma: ReturnType<typeof createFakePrisma>) {
  const clientService = createClientService({ prisma });
  const leadService = createLeadService({ prisma, clientService });
  return { clientService, leadService };
}

describe("convertLead", () => {
  it("creates a client and a primary contact seeded from the lead", async () => {
    const prisma = createFakePrisma();
    const { clientService, leadService } = setup(prisma);

    const lead = await leadService.createLead(ORG, {
      name: "Jamie Rivera",
      company: "Rivera Consulting",
      email: "jamie@rivera.test",
      phone: "555-0100",
      ownerId: OWNER,
    });

    const converted = await leadService.convertLead(ORG, lead.id);
    expect(converted.status).toBe("CONVERTED");
    expect(converted.convertedClientId).toBeTruthy();

    const client = await clientService.getClientOrThrow(ORG, converted.convertedClientId as string);
    expect(client.name).toBe("Rivera Consulting");

    const contacts = await clientService.listContacts(ORG, client.id);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.name).toBe("Jamie Rivera");
    expect(contacts[0]?.isPrimary).toBe(true);
  });

  it("refuses to convert an already-converted lead", async () => {
    const prisma = createFakePrisma();
    const { leadService } = setup(prisma);
    const lead = await leadService.createLead(ORG, { name: "Jamie", ownerId: OWNER });
    await leadService.convertLead(ORG, lead.id);

    await expect(leadService.convertLead(ORG, lead.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("falls back to the lead's own name when no company is given", async () => {
    const prisma = createFakePrisma();
    const { clientService, leadService } = setup(prisma);
    const lead = await leadService.createLead(ORG, { name: "Solo Freelancer", ownerId: OWNER });

    const converted = await leadService.convertLead(ORG, lead.id);
    const client = await clientService.getClientOrThrow(ORG, converted.convertedClientId as string);
    expect(client.name).toBe("Solo Freelancer");
  });
});

describe("tenant isolation", () => {
  it("Org A cannot view, update, or convert Org B's lead", async () => {
    const prisma = createFakePrisma();
    const { leadService } = setup(prisma);
    const orgBLead = await leadService.createLead("org_b", {
      name: "Secret Lead",
      ownerId: "org_b_owner",
    });

    await expect(leadService.getLeadOrThrow("org_a", orgBLead.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      leadService.updateLead("org_a", orgBLead.id, { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(leadService.convertLead("org_a", orgBLead.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const stillIntact = await leadService.getLeadOrThrow("org_b", orgBLead.id);
    expect(stillIntact.status).toBe("NEW");
  });

  it("listing leads never returns another org's rows", async () => {
    const prisma = createFakePrisma();
    const { leadService } = setup(prisma);
    await leadService.createLead("org_a", { name: "A", ownerId: "user_a" });
    await leadService.createLead("org_b", { name: "B", ownerId: "user_b" });

    const result = await leadService.listLeads("org_a", { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
  });
});
