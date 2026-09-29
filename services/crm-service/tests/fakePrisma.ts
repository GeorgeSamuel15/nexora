import type { PrismaClient } from "../generated/client/index.js";

interface FakeLead {
  id: string;
  organizationId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  ownerId: string;
  notes: string | null;
  convertedClientId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeClient {
  id: string;
  organizationId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeContact {
  id: string;
  organizationId: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeStage {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FakePipeline {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeDeal {
  id: string;
  organizationId: string;
  title: string;
  clientId: string;
  ownerId: string;
  pipelineId: string;
  stageId: string;
  value: number;
  status: string;
  expectedCloseDate: Date | null;
  probability: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeDealActivity {
  id: string;
  organizationId: string;
  dealId: string;
  actorId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createFakePrisma() {
  const leads = new Map<string, FakeLead>();
  const clients = new Map<string, FakeClient>();
  const contacts = new Map<string, FakeContact>();
  const pipelines = new Map<string, FakePipeline>();
  const stages = new Map<string, FakeStage>();
  const deals = new Map<string, FakeDeal>();
  const activities = new Map<string, FakeDealActivity>();

  const fake = {
    lead: {
      create: async ({
        data,
      }: {
        data: Pick<FakeLead, "organizationId" | "name" | "ownerId"> & Partial<FakeLead>;
      }) => {
        const lead: FakeLead = {
          id: nextId("lead"),
          company: null,
          email: null,
          phone: null,
          source: null,
          status: "NEW",
          notes: null,
          convertedClientId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        leads.set(lead.id, lead);
        return lead;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...leads.values()].find(
          (l) => l.id === where.id && l.organizationId === where.organizationId,
        ) ?? null,
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: { organizationId: string; status?: string; ownerId?: string };
        skip?: number;
        take?: number;
      }) =>
        [...leads.values()]
          .filter(
            (l) =>
              l.organizationId === where.organizationId &&
              (where.status === undefined || l.status === where.status) &&
              (where.ownerId === undefined || l.ownerId === where.ownerId),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: async ({
        where,
      }: {
        where: { organizationId: string; status?: string; ownerId?: string };
      }) =>
        [...leads.values()].filter(
          (l) =>
            l.organizationId === where.organizationId &&
            (where.status === undefined || l.status === where.status) &&
            (where.ownerId === undefined || l.ownerId === where.ownerId),
        ).length,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; organizationId: string };
        data: Partial<FakeLead>;
      }) => {
        const lead = [...leads.values()].find(
          (l) => l.id === where.id && l.organizationId === where.organizationId,
        );
        if (!lead) return { count: 0 };
        Object.assign(lead, data, { updatedAt: new Date() });
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeLead> }) => {
        const lead = leads.get(where.id);
        if (!lead) throw new Error("lead not found");
        Object.assign(lead, data, { updatedAt: new Date() });
        return lead;
      },
    },
    client: {
      create: async ({
        data,
      }: {
        data: Pick<FakeClient, "organizationId" | "name"> & Partial<FakeClient>;
      }) => {
        const client: FakeClient = {
          id: nextId("client"),
          company: null,
          email: null,
          phone: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        clients.set(client.id, client);
        return client;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...clients.values()].find(
          (c) => c.id === where.id && c.organizationId === where.organizationId,
        ) ?? null,
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: { organizationId: string };
        skip?: number;
        take?: number;
      }) =>
        [...clients.values()]
          .filter((c) => c.organizationId === where.organizationId)
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(skip, skip + take),
      count: async ({ where }: { where: { organizationId: string } }) =>
        [...clients.values()].filter((c) => c.organizationId === where.organizationId).length,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; organizationId: string };
        data: Partial<FakeClient>;
      }) => {
        const client = [...clients.values()].find(
          (c) => c.id === where.id && c.organizationId === where.organizationId,
        );
        if (!client) return { count: 0 };
        Object.assign(client, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    contact: {
      create: async ({
        data,
      }: {
        data: Pick<FakeContact, "organizationId" | "clientId" | "name"> & Partial<FakeContact>;
      }) => {
        const contact: FakeContact = {
          id: nextId("contact"),
          email: null,
          phone: null,
          jobTitle: null,
          isPrimary: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        contacts.set(contact.id, contact);
        return contact;
      },
      findMany: async ({ where }: { where: { clientId: string } }) =>
        [...contacts.values()]
          .filter((c) => c.clientId === where.clientId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    },
    pipeline: {
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          name: string;
          stages: { create: Array<{ name: string; order: number }> };
        };
      }) => {
        const pipeline: FakePipeline = {
          id: nextId("pipeline"),
          organizationId: data.organizationId,
          name: data.name,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        pipelines.set(pipeline.id, pipeline);
        const createdStages = data.stages.create.map((s) => {
          const stage: FakeStage = {
            id: nextId("stage"),
            pipelineId: pipeline.id,
            name: s.name,
            order: s.order,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          stages.set(stage.id, stage);
          return stage;
        });
        return { ...pipeline, stages: createdStages };
      },
      findUnique: async ({
        where,
      }: {
        where: { organizationId_name?: { organizationId: string; name: string } };
      }) => {
        if (where.organizationId_name) {
          const { organizationId, name } = where.organizationId_name;
          return (
            [...pipelines.values()].find(
              (p) => p.organizationId === organizationId && p.name === name,
            ) ?? null
          );
        }
        return null;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) => {
        const pipeline = [...pipelines.values()].find(
          (p) => p.id === where.id && p.organizationId === where.organizationId,
        );
        if (!pipeline) return null;
        return {
          ...pipeline,
          stages: [...stages.values()]
            .filter((s) => s.pipelineId === pipeline.id)
            .sort((a, b) => a.order - b.order),
        };
      },
      findMany: async ({ where }: { where: { organizationId: string } }) =>
        [...pipelines.values()]
          .filter((p) => p.organizationId === where.organizationId)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => ({
            ...p,
            stages: [...stages.values()]
              .filter((s) => s.pipelineId === p.id)
              .sort((a, b) => a.order - b.order),
          })),
    },
    pipelineStage: {
      findUnique: async ({
        where,
      }: {
        where: { pipelineId_name?: { pipelineId: string; name: string } };
      }) => {
        if (where.pipelineId_name) {
          const { pipelineId, name } = where.pipelineId_name;
          return (
            [...stages.values()].find((s) => s.pipelineId === pipelineId && s.name === name) ?? null
          );
        }
        return null;
      },
      findFirst: async ({ where }: { where: { id: string; pipelineId: string } }) =>
        [...stages.values()].find((s) => s.id === where.id && s.pipelineId === where.pipelineId) ??
        null,
      create: async ({ data }: { data: { pipelineId: string; name: string; order: number } }) => {
        const stage: FakeStage = {
          id: nextId("stage"),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        stages.set(stage.id, stage);
        return stage;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeStage> }) => {
        const stage = stages.get(where.id);
        if (!stage) throw new Error("stage not found");
        Object.assign(stage, data, { updatedAt: new Date() });
        return stage;
      },
    },
    deal: {
      create: async ({
        data,
      }: {
        data: Pick<
          FakeDeal,
          "organizationId" | "title" | "clientId" | "ownerId" | "pipelineId" | "stageId" | "value"
        > &
          Partial<FakeDeal>;
      }) => {
        const deal: FakeDeal = {
          id: nextId("deal"),
          status: "OPEN",
          expectedCloseDate: null,
          probability: 50,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        deals.set(deal.id, deal);
        return deal;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...deals.values()].find(
          (d) => d.id === where.id && d.organizationId === where.organizationId,
        ) ?? null,
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: {
          organizationId: string;
          pipelineId?: string;
          stageId?: string;
          status?: string;
          ownerId?: string;
          clientId?: string;
        };
        skip?: number;
        take?: number;
      }) =>
        [...deals.values()]
          .filter(
            (d) =>
              d.organizationId === where.organizationId &&
              (where.pipelineId === undefined || d.pipelineId === where.pipelineId) &&
              (where.stageId === undefined || d.stageId === where.stageId) &&
              (where.status === undefined || d.status === where.status) &&
              (where.ownerId === undefined || d.ownerId === where.ownerId) &&
              (where.clientId === undefined || d.clientId === where.clientId),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: async ({ where }: { where: { organizationId: string; status?: string } }) =>
        [...deals.values()].filter(
          (d) =>
            d.organizationId === where.organizationId &&
            (where.status === undefined || d.status === where.status),
        ).length,
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeDeal> }) => {
        const deal = deals.get(where.id);
        if (!deal) throw new Error("deal not found");
        Object.assign(deal, data, { updatedAt: new Date() });
        return deal;
      },
    },
    dealActivity: {
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          dealId: string;
          actorId: string;
          action: string;
          metadata: Record<string, unknown>;
        };
      }) => {
        const activity: FakeDealActivity = {
          id: nextId("activity"),
          createdAt: new Date(),
          ...data,
        };
        activities.set(activity.id, activity);
        return activity;
      },
      findMany: async ({ where }: { where: { dealId: string } }) =>
        [...activities.values()]
          .filter((a) => a.dealId === where.dealId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    },
  };

  return fake as unknown as PrismaClient;
}
