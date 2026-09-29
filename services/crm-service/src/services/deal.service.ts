import { toJsonObject, omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import { buildEvent, type DealWonEvent, type EventPublisher } from "@nexora/events";
import type { PaginatedResult } from "@nexora/types";
import type { ClientService } from "./client.service.js";
import type { PipelineService } from "./pipeline.service.js";
import type {
  CreateDealInput,
  ListDealsQuery,
  UpdateDealInput,
} from "../validation/deal.schemas.js";
export interface DealServiceDeps {
  prisma: PrismaClient;
  clientService: ClientService;
  pipelineService: PipelineService;
  eventPublisher: EventPublisher;
}
export function createDealService(deps: DealServiceDeps) {
  const { prisma, clientService, pipelineService, eventPublisher } = deps;
  async function logActivity(
    organizationId: string,
    dealId: string,
    actorId: string,
    action: string,
    metadata: Record<string, unknown> = {},
  ) {
    await prisma.dealActivity.create({
      data: omitUndefined({
        organizationId,
        dealId,
        actorId,
        action,
        metadata: toJsonObject(metadata),
      }),
    });
  }
  async function createDeal(organizationId: string, actorId: string, input: CreateDealInput) {
    await clientService.getClientOrThrow(organizationId, input.clientId);
    await pipelineService.assertStageInPipeline(organizationId, input.pipelineId, input.stageId);
    const deal = await prisma.deal.create({
      data: omitUndefined({
        organizationId,
        title: input.title,
        clientId: input.clientId,
        ownerId: input.ownerId,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        value: input.value,
        expectedCloseDate: input.expectedCloseDate
          ? new Date(`${input.expectedCloseDate}T00:00:00Z`)
          : undefined,
        probability: input.probability,
        notes: input.notes,
      }),
    });
    await logActivity(organizationId, deal.id, actorId, "CREATED", {
      title: deal.title,
      value: deal.value,
    });
    return deal;
  }
  async function listDeals(
    organizationId: string,
    query: ListDealsQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.pipelineId ? { pipelineId: query.pipelineId } : {}),
      ...(query.stageId ? { stageId: query.stageId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.deal.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.deal.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function getDealOrThrow(organizationId: string, dealId: string) {
    const deal = await prisma.deal.findFirst({ where: { id: dealId, organizationId } });
    if (!deal) {
      throw new NotFoundError("Deal");
    }
    return deal;
  }
  function assertOpen(deal: { status: string }) {
    if (deal.status !== "OPEN") {
      throw new ConflictError(`This deal is already ${deal.status} and can no longer be edited.`);
    }
  }
  async function updateDeal(
    organizationId: string,
    dealId: string,
    actorId: string,
    input: UpdateDealInput,
  ) {
    const deal = await getDealOrThrow(organizationId, dealId);
    assertOpen(deal);
    if (input.stageId && input.stageId !== deal.stageId) {
      await pipelineService.assertStageInPipeline(organizationId, deal.pipelineId, input.stageId);
      await logActivity(organizationId, deal.id, actorId, "STAGE_CHANGED", {
        from: deal.stageId,
        to: input.stageId,
      });
    }
    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: omitUndefined({
        ...input,
        expectedCloseDate:
          input.expectedCloseDate === undefined
            ? undefined
            : input.expectedCloseDate
              ? new Date(`${input.expectedCloseDate}T00:00:00Z`)
              : null,
      }),
    });
    return updated;
  }
  async function winDeal(organizationId: string, dealId: string, actorId: string) {
    const deal = await getDealOrThrow(organizationId, dealId);
    assertOpen(deal);
    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: omitUndefined({ status: "WON", probability: 100 }),
    });
    await logActivity(organizationId, deal.id, actorId, "WON", { value: deal.value });
    const event = buildEvent<DealWonEvent>("DEAL_WON", organizationId, {
      dealId: deal.id,
      dealTitle: deal.title,
      clientId: deal.clientId,
      value: deal.value,
      ownerId: deal.ownerId,
    });
    await eventPublisher.publish(event);
    return updated;
  }
  async function loseDeal(
    organizationId: string,
    dealId: string,
    actorId: string,
    reason?: string,
  ) {
    const deal = await getDealOrThrow(organizationId, dealId);
    assertOpen(deal);
    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: omitUndefined({ status: "LOST", probability: 0 }),
    });
    await logActivity(organizationId, deal.id, actorId, "LOST", { reason });
    return updated;
  }
  async function listActivities(organizationId: string, dealId: string) {
    await getDealOrThrow(organizationId, dealId);
    return prisma.dealActivity.findMany({ where: { dealId }, orderBy: { createdAt: "asc" } });
  }
  /** Backs analytics-service's dashboard aggregation (Phase 11). */
  async function getStats(organizationId: string) {
    const openDeals = await prisma.deal.count({ where: { organizationId, status: "OPEN" } });
    return { openDeals };
  }
  return {
    createDeal,
    listDeals,
    getDealOrThrow,
    updateDeal,
    winDeal,
    loseDeal,
    listActivities,
    getStats,
  };
}
export type DealService = ReturnType<typeof createDealService>;
