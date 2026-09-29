import { omitUndefined, toJsonObject } from "@nexora/utils";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/client/index.js";
import { NotFoundError } from "@nexora/http";
import { buildPaginationMeta, toSkipTake } from "@nexora/utils";
import { buildEvent, type DocumentSharedEvent, type EventPublisher } from "@nexora/events";
import type { AuditClient } from "@nexora/audit-client";
import type { PaginatedResult } from "@nexora/types";
import type { StorageDriver } from "../storage/index.js";
import type {
  ListDocumentsQuery,
  RenameDocumentInput,
  ShareDocumentInput,
  UploadMetadataInput,
} from "../validation/document.schemas.js";
export interface UploadedFile {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}
export interface DocumentServiceDeps {
  prisma: PrismaClient;
  storage: StorageDriver;
  eventPublisher: EventPublisher;
  auditClient: AuditClient;
}
/** Strips path separators and other characters that have no business
 * being in a stored key, even though the storage driver also guards
 * against path traversal independently - defense in depth on
 * user-supplied input (build spec section 15: "Do not expose
 * unrestricted file-system paths"). */
function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[/\\]/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-150) || "file"
  );
}
function generateStorageKey(organizationId: string, originalName: string): string {
  return `${organizationId}/${randomUUID()}-${sanitizeFileName(originalName)}`;
}
export function createDocumentService(deps: DocumentServiceDeps) {
  const { prisma, storage, eventPublisher, auditClient } = deps;
  async function uploadDocument(
    organizationId: string,
    uploadedBy: string,
    file: UploadedFile,
    metadata: UploadMetadataInput,
  ) {
    const storageKey = generateStorageKey(organizationId, file.originalName);
    await storage.save(storageKey, file.buffer);
    try {
      return await prisma.document.create({
        data: omitUndefined({
          organizationId,
          name: file.originalName,
          fileName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          storageKey,
          uploadedBy,
          category: metadata.category,
          entityType: metadata.entityType,
          entityId: metadata.entityId,
        }),
      });
    } catch (err) {
      // The bytes are already on disk - if the metadata row fails (e.g.
      // a DB hiccup), don't leave an orphaned file behind.
      await storage.delete(storageKey).catch(() => undefined);
      throw err;
    }
  }
  async function listDocuments(
    organizationId: string,
    query: ListDocumentsQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      organizationId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    };
    const { skip, take } = toSkipTake({ page: query.page, pageSize: query.pageSize });
    const [data, total] = await Promise.all([
      prisma.document.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.document.count({ where }),
    ]);
    return {
      data,
      pagination: buildPaginationMeta({ page: query.page, pageSize: query.pageSize }, total),
    };
  }
  async function getDocumentOrThrow(organizationId: string, documentId: string) {
    const document = await prisma.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) {
      throw new NotFoundError("Document");
    }
    return document;
  }
  /** Returns the actual bytes alongside the metadata needed to set
   * response headers - the route handler streams this back, the client
   * never sees a storage key or a filesystem path. */
  async function downloadDocument(organizationId: string, documentId: string) {
    const document = await getDocumentOrThrow(organizationId, documentId);
    const buffer = await storage.read(document.storageKey);
    return { document, buffer };
  }
  async function renameDocument(
    organizationId: string,
    documentId: string,
    input: RenameDocumentInput,
  ) {
    const result = await prisma.document.updateMany({
      where: { id: documentId, organizationId },
      data: omitUndefined({ name: input.name }),
    });
    if (result.count === 0) {
      throw new NotFoundError("Document");
    }
    return getDocumentOrThrow(organizationId, documentId);
  }
  /**
   * Records that a document was shared with someone and publishes
   * DOCUMENT_SHARED - informational/notification-triggering only.
   * Document access is already org-wide via the document.read
   * permission, so this does NOT gate downloadDocument; it's an audit
   * trail plus a trigger for notification-service, not an ACL grant. A
   * real per-document access-control system is a bigger feature than
   * this phase's scope - see README.
   */
  async function shareDocument(
    organizationId: string,
    sharedBy: string,
    documentId: string,
    input: ShareDocumentInput,
  ) {
    const document = await getDocumentOrThrow(organizationId, documentId);
    const share = await prisma.documentShare.upsert({
      where: { documentId_sharedWith: { documentId: document.id, sharedWith: input.userId } },
      create: { organizationId, documentId: document.id, sharedBy, sharedWith: input.userId },
      update: {},
    });
    await eventPublisher.publish(
      buildEvent<DocumentSharedEvent>("DOCUMENT_SHARED", organizationId, {
        documentId: document.id,
        sharedBy,
        sharedWith: input.userId,
      }),
    );
    return share;
  }
  async function deleteDocument(organizationId: string, actorId: string, documentId: string) {
    const document = await getDocumentOrThrow(organizationId, documentId);
    await prisma.document.delete({ where: { id: document.id } });
    // Metadata deletion is the source of truth for "does this document
    // exist" - if the storage delete fails after this, the row is
    // already gone and a retry-safe cleanup job (not built in V1) would
    // be the real fix. Deleting storage first and metadata failing
    // would be worse (a metadata row pointing at nothing).
    await storage.delete(document.storageKey);
    await auditClient.record({
      organizationId,
      actorId,
      action: "DOCUMENT_DELETED",
      entityType: "document",
      entityId: documentId,
      metadata: toJsonObject({ name: document.name, fileName: document.fileName }),
    });
  }
  return {
    uploadDocument,
    listDocuments,
    getDocumentOrThrow,
    downloadDocument,
    renameDocument,
    shareDocument,
    deleteDocument,
  };
}
export type DocumentService = ReturnType<typeof createDocumentService>;
