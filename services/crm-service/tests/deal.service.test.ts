import { describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "@nexora/http";
import type { EventPublisher, NexoraEvent } from "@nexora/events";
import { createClientService } from "../src/services/client.service.js";
import { createPipelineService } from "../src/services/pipeline.service.js";
import { createDealService } from "../src/services/deal.service.js";
import { createFakePrisma } from "./fakePrisma.js";

const ORG = "org_1";
const OWNER = "user_owner";

function capturingPublisher(): EventPublisher & { events: NexoraEvent[] } {
  const events: NexoraEvent[] = [];
  return {
    events,
    publish: vi.fn(async (event: NexoraEvent) => {
      events.push(event);
    }),
  };
}

async function setup(prisma: ReturnType<typeof createFakePrisma>) {
  const clientService = createClientService({ prisma });
  const pipelineService = createPipelineService({ prisma });
  const eventPublisher = capturingPublisher();
  const dealService = createDealService({ prisma, clientService, pipelineService, eventPublisher });

  const client = await clientService.createClient(ORG, { name: "Acme Co" });
  const pipeline = await pipelineService.createPipeline(ORG, {
    name: "Sales",
    stageNames: ["New", "Qualified", "Won"],
  });
  const firstStage = (pipeline as unknown as { stages: Array<{ id: string }> }).stages[0];

  return {
    clientService,
    pipelineService,
    dealService,
    eventPublisher,
    client,
    pipeline,
    firstStage,
  };
}

describe("createDeal", () => {
  it("creates an OPEN deal and logs a CREATED activity", async () => {
    const prisma = createFakePrisma();
    const { dealService, client, pipeline, firstStage } = await setup(prisma);

    const deal = await dealService.createDeal(ORG, OWNER, {
      title: "Acme renewal",
      clientId: client.id,
      ownerId: OWNER,
      pipelineId: pipeline.id,
      stageId: firstStage!.id,
      value: 50000,
      probability: 40,
    });

    expect(deal.status).toBe("OPEN");
    const activities = await dealService.listActivities(ORG, deal.id);
    expect(activities.some((a: { action: string }) => a.action === "CREATED")).toBe(true);
  });

  it("rejects a deal for a client in a different organization", async () => {
    const prisma = createFakePrisma();
    const { dealService, pipeline, firstStage } = await setup(prisma);
    const otherOrgClientService = createClientService({ prisma });
    const otherOrgClient = await otherOrgClientService.createClient("org_other", { name: "Other" });

    await expect(
      dealService.createDeal(ORG, OWNER, {
        title: "Bad deal",
        clientId: otherOrgClient.id,
        ownerId: OWNER,
        pipelineId: pipeline.id,
        stageId: firstStage!.id,
        value: 1000,
        probability: 50,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a stage that doesn't belong to the given pipeline", async () => {
    const prisma = createFakePrisma();
    const { dealService, pipelineService, client, pipeline } = await setup(prisma);
    const otherPipeline = await pipelineService.createPipeline(ORG, {
      name: "Other Pipeline",
      stageNames: ["Start"],
    });
    const otherStage = (otherPipeline as unknown as { stages: Array<{ id: string }> }).stages[0];

    await expect(
      dealService.createDeal(ORG, OWNER, {
        title: "Mismatched stage",
        clientId: client.id,
        ownerId: OWNER,
        pipelineId: pipeline.id,
        stageId: otherStage!.id,
        value: 1000,
        probability: 50,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("winDeal / loseDeal", () => {
  it("winning sets status WON, probability 100, and publishes DEAL_WON", async () => {
    const prisma = createFakePrisma();
    const { dealService, eventPublisher, client, pipeline, firstStage } = await setup(prisma);
    const deal = await dealService.createDeal(ORG, OWNER, {
      title: "Big deal",
      clientId: client.id,
      ownerId: OWNER,
      pipelineId: pipeline.id,
      stageId: firstStage!.id,
      value: 100000,
      probability: 60,
    });

    const won = await dealService.winDeal(ORG, deal.id, OWNER);
    expect(won.status).toBe("WON");
    expect(won.probability).toBe(100);

    expect(eventPublisher.events).toHaveLength(1);
    expect(eventPublisher.events[0]?.type).toBe("DEAL_WON");
    expect(eventPublisher.events[0]?.payload).toMatchObject({
      dealId: deal.id,
      value: 100000,
      clientId: client.id,
    });
  });

  it("losing sets status LOST and probability 0, without publishing an event", async () => {
    const prisma = createFakePrisma();
    const { dealService, eventPublisher, client, pipeline, firstStage } = await setup(prisma);
    const deal = await dealService.createDeal(ORG, OWNER, {
      title: "Lost cause",
      clientId: client.id,
      ownerId: OWNER,
      pipelineId: pipeline.id,
      stageId: firstStage!.id,
      value: 5000,
      probability: 30,
    });

    const lost = await dealService.loseDeal(ORG, deal.id, OWNER, "Went with a competitor");
    expect(lost.status).toBe("LOST");
    expect(lost.probability).toBe(0);
    expect(eventPublisher.events).toHaveLength(0);
  });

  it("refuses to win or lose a deal that isn't OPEN", async () => {
    const prisma = createFakePrisma();
    const { dealService, client, pipeline, firstStage } = await setup(prisma);
    const deal = await dealService.createDeal(ORG, OWNER, {
      title: "Deal",
      clientId: client.id,
      ownerId: OWNER,
      pipelineId: pipeline.id,
      stageId: firstStage!.id,
      value: 1000,
      probability: 50,
    });
    await dealService.winDeal(ORG, deal.id, OWNER);

    await expect(dealService.winDeal(ORG, deal.id, OWNER)).rejects.toBeInstanceOf(ConflictError);
    await expect(dealService.loseDeal(ORG, deal.id, OWNER)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to update a deal that isn't OPEN", async () => {
    const prisma = createFakePrisma();
    const { dealService, client, pipeline, firstStage } = await setup(prisma);
    const deal = await dealService.createDeal(ORG, OWNER, {
      title: "Deal",
      clientId: client.id,
      ownerId: OWNER,
      pipelineId: pipeline.id,
      stageId: firstStage!.id,
      value: 1000,
      probability: 50,
    });
    await dealService.loseDeal(ORG, deal.id, OWNER);

    await expect(
      dealService.updateDeal(ORG, deal.id, OWNER, { value: 2000 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("tenant isolation", () => {
  it("Org A cannot view, update, win, or lose Org B's deal", async () => {
    const prisma = createFakePrisma();
    const orgBSetup = await setup(prisma);
    const orgBClient = await orgBSetup.clientService.createClient("org_b", {
      name: "Org B Client",
    });
    const orgBPipeline = await orgBSetup.pipelineService.createPipeline("org_b", {
      name: "Org B Pipeline",
      stageNames: ["Start"],
    });
    const orgBStage = (orgBPipeline as unknown as { stages: Array<{ id: string }> }).stages[0];
    const orgBDeal = await orgBSetup.dealService.createDeal("org_b", "org_b_owner", {
      title: "Org B Deal",
      clientId: orgBClient.id,
      ownerId: "org_b_owner",
      pipelineId: orgBPipeline.id,
      stageId: orgBStage!.id,
      value: 9999,
      probability: 50,
    });

    await expect(orgBSetup.dealService.getDealOrThrow("org_a", orgBDeal.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      orgBSetup.dealService.updateDeal("org_a", orgBDeal.id, "intruder", { value: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      orgBSetup.dealService.winDeal("org_a", orgBDeal.id, "intruder"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      orgBSetup.dealService.loseDeal("org_a", orgBDeal.id, "intruder"),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stillIntact = await orgBSetup.dealService.getDealOrThrow("org_b", orgBDeal.id);
    expect(stillIntact.status).toBe("OPEN");
  });
});

describe("getStats", () => {
  it("counts only OPEN deals, scoped to the organization", async () => {
    const prisma = createFakePrisma();
    const { dealService, client, pipeline, firstStage } = await setup(prisma);

    const dealToWin = await dealService.createDeal(ORG, OWNER, {
      title: "Will be won",
      clientId: client.id,
      ownerId: OWNER,
      pipelineId: pipeline.id,
      stageId: firstStage!.id,
      value: 1000,
      probability: 50,
    });
    await dealService.createDeal(ORG, OWNER, {
      title: "Stays open",
      clientId: client.id,
      ownerId: OWNER,
      pipelineId: pipeline.id,
      stageId: firstStage!.id,
      value: 2000,
      probability: 50,
    });
    await dealService.winDeal(ORG, dealToWin.id, OWNER);

    const stats = await dealService.getStats(ORG);
    expect(stats).toEqual({ openDeals: 1 });
  });
});
