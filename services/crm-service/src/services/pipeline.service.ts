import { omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import type {
  CreatePipelineInput,
  CreateStageInput,
  UpdateStageInput,
} from "../validation/pipeline.schemas.js";
export interface PipelineServiceDeps {
  prisma: PrismaClient;
}
export function createPipelineService(deps: PipelineServiceDeps) {
  const { prisma } = deps;
  async function createPipeline(organizationId: string, input: CreatePipelineInput) {
    const existing = await prisma.pipeline.findUnique({
      where: { organizationId_name: { organizationId, name: input.name } },
    });
    if (existing) {
      throw new ConflictError(`A pipeline named "${input.name}" already exists.`);
    }
    return prisma.pipeline.create({
      data: omitUndefined({
        organizationId,
        name: input.name,
        stages: {
          create: input.stageNames.map((name: string, index: number) => ({ name, order: index })),
        },
      }),
      include: { stages: { orderBy: { order: "asc" } } },
    });
  }
  async function listPipelines(organizationId: string) {
    return prisma.pipeline.findMany({
      where: { organizationId },
      include: { stages: { orderBy: { order: "asc" } } },
      orderBy: { name: "asc" },
    });
  }
  async function getPipelineOrThrow(organizationId: string, pipelineId: string) {
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: pipelineId, organizationId },
      include: { stages: { orderBy: { order: "asc" } } },
    });
    if (!pipeline) {
      throw new NotFoundError("Pipeline");
    }
    return pipeline;
  }
  /** Groups OPEN deals by stage - exactly the shape a kanban-style
   * pipeline visualization needs (build spec section 13: "Implement sales
   * pipeline visualization"). Rendering that board is a frontend concern
   * (Phase 20); this is the data it would consume. */
  async function getPipelineBoard(organizationId: string, pipelineId: string) {
    const pipeline = await getPipelineOrThrow(organizationId, pipelineId);
    const deals = await prisma.deal.findMany({
      where: { organizationId, pipelineId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    const dealsByStage = new Map<string, unknown[]>();
    for (const deal of deals as Array<{
      stageId: string;
    }>) {
      const list = dealsByStage.get(deal.stageId) ?? [];
      list.push(deal);
      dealsByStage.set(deal.stageId, list);
    }
    return {
      pipeline: { id: pipeline.id, name: pipeline.name },
      columns: (
        pipeline.stages as Array<{
          id: string;
          name: string;
          order: number;
        }>
      ).map((stage) => ({
        stage,
        deals: dealsByStage.get(stage.id) ?? [],
      })),
    };
  }
  async function addStage(organizationId: string, pipelineId: string, input: CreateStageInput) {
    await getPipelineOrThrow(organizationId, pipelineId);
    const existing = await prisma.pipelineStage.findUnique({
      where: { pipelineId_name: { pipelineId, name: input.name } },
    });
    if (existing) {
      throw new ConflictError(`A stage named "${input.name}" already exists in this pipeline.`);
    }
    return prisma.pipelineStage.create({ data: omitUndefined({ pipelineId, ...input }) });
  }
  async function updateStage(
    organizationId: string,
    pipelineId: string,
    stageId: string,
    input: UpdateStageInput,
  ) {
    await getPipelineOrThrow(organizationId, pipelineId);
    const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } });
    if (!stage) {
      throw new NotFoundError("Pipeline stage");
    }
    return prisma.pipelineStage.update({ where: { id: stageId }, data: omitUndefined(input) });
  }
  async function assertStageInPipeline(
    organizationId: string,
    pipelineId: string,
    stageId: string,
  ) {
    await getPipelineOrThrow(organizationId, pipelineId);
    const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } });
    if (!stage) {
      throw new NotFoundError("Pipeline stage");
    }
    return stage;
  }
  return {
    createPipeline,
    listPipelines,
    getPipelineOrThrow,
    getPipelineBoard,
    addStage,
    updateStage,
    assertStageInPipeline,
  };
}
export type PipelineService = ReturnType<typeof createPipelineService>;
