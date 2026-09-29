import { omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { ConflictError, NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import type { PaginatedResult } from "@nexora/types";
import type { ClientService } from "./client.service.js";
import type {
  CreateLeadInput,
  ListLeadsQuery,
  UpdateLeadInput,
} from "../validation/lead.schemas.js";
export interface LeadServiceDeps {
  prisma: PrismaClient;
  clientService: ClientService;
}
export function createLeadService(deps: LeadServiceDeps) {
  const { prisma, clientService } = deps;
  async function createLead(organizationId: string, input: CreateLeadInput) {
    return prisma.lead.create({ data: omitUndefined({ organizationId, ...input }) });
  }
  async function listLeads(
    organizationId: string,
    query: ListLeadsQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.lead.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.lead.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function getLeadOrThrow(organizationId: string, leadId: string) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
    if (!lead) {
      throw new NotFoundError("Lead");
    }
    return lead;
  }
  async function updateLead(organizationId: string, leadId: string, input: UpdateLeadInput) {
    const result = await prisma.lead.updateMany({
      where: { id: leadId, organizationId },
      data: omitUndefined(input),
    });
    if (result.count === 0) {
      throw new NotFoundError("Lead");
    }
    return getLeadOrThrow(organizationId, leadId);
  }
  /** Converts a lead into a Client (+ a primary Contact seeded from the
   * lead's own name/email/phone). The lead itself is kept, not deleted -
   * it becomes a historical record of where the client came from. */
  async function convertLead(organizationId: string, leadId: string) {
    const lead = await getLeadOrThrow(organizationId, leadId);
    if (lead.status === "CONVERTED") {
      throw new ConflictError("This lead has already been converted.");
    }
    const client = await clientService.createClient(organizationId, {
      name: lead.company || lead.name,
      company: lead.company ?? undefined,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
    });
    await clientService.addContact(organizationId, client.id, {
      name: lead.name,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
      isPrimary: true,
    });
    return prisma.lead.update({
      where: { id: lead.id },
      data: omitUndefined({ status: "CONVERTED", convertedClientId: client.id }),
    });
  }
  return { createLead, listLeads, getLeadOrThrow, updateLead, convertLead };
}
export type LeadService = ReturnType<typeof createLeadService>;
