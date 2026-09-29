import { omitUndefined } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import type { PaginatedResult } from "@nexora/types";
import type {
  CreateClientInput,
  CreateContactInput,
  ListClientsQuery,
  UpdateClientInput,
} from "../validation/client.schemas.js";
export interface ClientServiceDeps {
  prisma: PrismaClient;
}
export function createClientService(deps: ClientServiceDeps) {
  const { prisma } = deps;
  async function createClient(organizationId: string, input: CreateClientInput) {
    return prisma.client.create({ data: omitUndefined({ organizationId, ...input }) });
  }
  async function listClients(
    organizationId: string,
    query: ListClientsQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.client.findMany({ where, skip, take, orderBy: { name: "asc" } }),
      prisma.client.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function getClientOrThrow(organizationId: string, clientId: string) {
    const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
    if (!client) {
      throw new NotFoundError("Client");
    }
    return client;
  }
  async function updateClient(organizationId: string, clientId: string, input: UpdateClientInput) {
    const result = await prisma.client.updateMany({
      where: { id: clientId, organizationId },
      data: omitUndefined(input),
    });
    if (result.count === 0) {
      throw new NotFoundError("Client");
    }
    return getClientOrThrow(organizationId, clientId);
  }
  async function addContact(organizationId: string, clientId: string, input: CreateContactInput) {
    await getClientOrThrow(organizationId, clientId);
    return prisma.contact.create({ data: omitUndefined({ organizationId, clientId, ...input }) });
  }
  async function listContacts(organizationId: string, clientId: string) {
    await getClientOrThrow(organizationId, clientId);
    return prisma.contact.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
  }
  return { createClient, listClients, getClientOrThrow, updateClient, addContact, listContacts };
}
export type ClientService = ReturnType<typeof createClientService>;
