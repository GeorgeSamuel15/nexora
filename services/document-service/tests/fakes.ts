import type { PrismaClient } from "../generated/client/index.js";
import type { StorageDriver } from "../src/storage/index.js";
import { StorageKeyNotFoundError } from "../src/storage/index.js";

export function createFakeStorage(): StorageDriver & { fileCount: () => number } {
  const files = new Map<string, Buffer>();
  return {
    save: async (key: string, data: Buffer) => {
      files.set(key, data);
    },
    read: async (key: string) => {
      const data = files.get(key);
      if (!data) throw new StorageKeyNotFoundError(key);
      return data;
    },
    delete: async (key: string) => {
      files.delete(key);
    },
    exists: async (key: string) => files.has(key),
    fileCount: () => files.size,
  };
}

interface FakeDocument {
  id: string;
  organizationId: string;
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  uploadedBy: string;
  category: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `document_${idCounter}`;
}

let shareIdCounter = 0;
function nextShareId(): string {
  shareIdCounter += 1;
  return `share_${shareIdCounter}`;
}

export function createFakePrisma() {
  const documents = new Map<string, FakeDocument>();
  const documentShares = new Map<
    string,
    {
      id: string;
      organizationId: string;
      documentId: string;
      sharedBy: string;
      sharedWith: string;
      createdAt: Date;
    }
  >();

  const fake = {
    document: {
      create: async ({
        data,
      }: {
        data: Pick<
          FakeDocument,
          "organizationId" | "name" | "fileName" | "mimeType" | "size" | "storageKey" | "uploadedBy"
        > &
          Partial<FakeDocument>;
      }) => {
        const doc: FakeDocument = {
          id: nextId(),
          category: null,
          entityType: null,
          entityId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        documents.set(doc.id, doc);
        return doc;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...documents.values()].find(
          (d) => d.id === where.id && d.organizationId === where.organizationId,
        ) ?? null,
      findMany: async ({
        where,
        skip = 0,
        take = 20,
      }: {
        where: {
          organizationId: string;
          category?: string;
          entityType?: string;
          entityId?: string;
        };
        skip?: number;
        take?: number;
      }) =>
        [...documents.values()]
          .filter(
            (d) =>
              d.organizationId === where.organizationId &&
              (where.category === undefined || d.category === where.category) &&
              (where.entityType === undefined || d.entityType === where.entityType) &&
              (where.entityId === undefined || d.entityId === where.entityId),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: async ({
        where,
      }: {
        where: {
          organizationId: string;
          category?: string;
          entityType?: string;
          entityId?: string;
        };
      }) =>
        [...documents.values()].filter(
          (d) =>
            d.organizationId === where.organizationId &&
            (where.category === undefined || d.category === where.category) &&
            (where.entityType === undefined || d.entityType === where.entityType) &&
            (where.entityId === undefined || d.entityId === where.entityId),
        ).length,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; organizationId: string };
        data: Partial<FakeDocument>;
      }) => {
        const doc = [...documents.values()].find(
          (d) => d.id === where.id && d.organizationId === where.organizationId,
        );
        if (!doc) return { count: 0 };
        Object.assign(doc, data, { updatedAt: new Date() });
        return { count: 1 };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        documents.delete(where.id);
      },
    },
    documentShare: {
      upsert: async ({
        where,
        create,
      }: {
        where: { documentId_sharedWith: { documentId: string; sharedWith: string } };
        create: {
          organizationId: string;
          documentId: string;
          sharedBy: string;
          sharedWith: string;
        };
        update: Record<string, never>;
      }) => {
        const { documentId, sharedWith } = where.documentId_sharedWith;
        const existing = [...documentShares.values()].find(
          (s) => s.documentId === documentId && s.sharedWith === sharedWith,
        );
        if (existing) return existing;
        const share = { id: nextShareId(), createdAt: new Date(), ...create };
        documentShares.set(share.id, share);
        return share;
      },
    },
  };

  return fake as unknown as PrismaClient;
}
