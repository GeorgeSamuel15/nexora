import { describe, expect, it } from "vitest";
import { NotFoundError } from "@nexora/http";
import { createDocumentService } from "../src/services/document.service.js";
import { createCapturingPublisher } from "./fakeEventPublisher.js";
import { createCapturingAuditClient } from "./fakeAuditClient.js";
import { createFakePrisma, createFakeStorage } from "./fakes.js";

const ORG = "org_1";
const UPLOADER = "user_1";
const ACTOR = "user_actor";

function fakeFile(
  overrides: Partial<{ originalName: string; mimeType: string; size: number; buffer: Buffer }> = {},
) {
  return {
    originalName: "report.pdf",
    mimeType: "application/pdf",
    size: 1234,
    buffer: Buffer.from("fake pdf bytes"),
    ...overrides,
  };
}

describe("uploadDocument", () => {
  it("stores the bytes and creates a metadata record pointing at a generated key", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });

    const document = await service.uploadDocument(ORG, UPLOADER, fakeFile(), {
      category: "invoices",
    });

    expect(document.name).toBe("report.pdf");
    expect(document.storageKey).toContain(ORG);
    expect(storage.fileCount()).toBe(1);
  });

  it("sanitizes a file name containing path separators before generating the storage key", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });

    const document = await service.uploadDocument(
      ORG,
      UPLOADER,
      fakeFile({ originalName: "../../etc/passwd" }),
      {},
    );
    expect(document.storageKey).not.toContain("../");
    expect(document.storageKey).not.toContain("/etc/");
  });

  it("does not leave an orphaned file if the metadata write fails", async () => {
    const prisma = createFakePrisma();
    prisma.document.create = (async () => {
      throw new Error("db exploded");
    }) as typeof prisma.document.create;
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });

    await expect(service.uploadDocument(ORG, UPLOADER, fakeFile(), {})).rejects.toThrow(
      "db exploded",
    );
    expect(storage.fileCount()).toBe(0);
  });
});

describe("listDocuments", () => {
  it("filters by category and entity", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });

    await service.uploadDocument(ORG, UPLOADER, fakeFile({ originalName: "a.pdf" }), {
      category: "invoices",
    });
    await service.uploadDocument(ORG, UPLOADER, fakeFile({ originalName: "b.pdf" }), {
      category: "contracts",
      entityType: "project",
      entityId: "project_1",
    });

    const invoices = await service.listDocuments(ORG, {
      page: 1,
      pageSize: 20,
      category: "invoices",
    });
    expect(invoices.data).toHaveLength(1);

    const projectDocs = await service.listDocuments(ORG, {
      page: 1,
      pageSize: 20,
      entityType: "project",
      entityId: "project_1",
    });
    expect(projectDocs.data).toHaveLength(1);
  });

  it("never returns another organization's documents", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });

    await service.uploadDocument("org_a", "user_a", fakeFile(), {});
    await service.uploadDocument("org_b", "user_b", fakeFile(), {});

    const result = await service.listDocuments("org_a", { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
  });
});

describe("downloadDocument", () => {
  it("returns the original bytes alongside metadata", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });
    const uploaded = await service.uploadDocument(
      ORG,
      UPLOADER,
      fakeFile({ buffer: Buffer.from("exact bytes") }),
      {},
    );

    const { document, buffer } = await service.downloadDocument(ORG, uploaded.id);
    expect(buffer.toString()).toBe("exact bytes");
    expect(document.fileName).toBe("report.pdf");
  });
});

describe("deleteDocument", () => {
  it("removes both the metadata row and the stored bytes", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });
    const uploaded = await service.uploadDocument(ORG, UPLOADER, fakeFile(), {});

    await service.deleteDocument(ORG, ACTOR, uploaded.id);

    expect(storage.fileCount()).toBe(0);
    await expect(service.getDocumentOrThrow(ORG, uploaded.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("tenant isolation", () => {
  it("Org A cannot get, download, rename, or delete Org B's document", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });
    const orgBDoc = await service.uploadDocument("org_b", "org_b_user", fakeFile(), {});

    await expect(service.getDocumentOrThrow("org_a", orgBDoc.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.downloadDocument("org_a", orgBDoc.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      service.renameDocument("org_a", orgBDoc.id, { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.deleteDocument("org_a", ACTOR, orgBDoc.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    // Confirm it's genuinely untouched - both metadata and bytes.
    const stillIntact = await service.getDocumentOrThrow("org_b", orgBDoc.id);
    expect(stillIntact.name).toBe("report.pdf");
    expect(storage.fileCount()).toBe(1);
  });
});

describe("shareDocument", () => {
  it("records the share and publishes DOCUMENT_SHARED", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const eventPublisher = createCapturingPublisher();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher,
      auditClient: createCapturingAuditClient(),
    });
    const uploaded = await service.uploadDocument(ORG, UPLOADER, fakeFile(), {});

    const share = await service.shareDocument(ORG, UPLOADER, uploaded.id, {
      userId: "user_recipient",
    });
    expect(share.sharedWith).toBe("user_recipient");

    expect(eventPublisher.events).toHaveLength(1);
    expect(eventPublisher.events[0]?.type).toBe("DOCUMENT_SHARED");
    expect(eventPublisher.events[0]?.payload).toMatchObject({
      documentId: uploaded.id,
      sharedBy: UPLOADER,
      sharedWith: "user_recipient",
    });
  });

  it("sharing the same document with the same person twice does not create a duplicate record", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });
    const uploaded = await service.uploadDocument(ORG, UPLOADER, fakeFile(), {});

    const first = await service.shareDocument(ORG, UPLOADER, uploaded.id, {
      userId: "user_recipient",
    });
    const second = await service.shareDocument(ORG, UPLOADER, uploaded.id, {
      userId: "user_recipient",
    });
    expect(first.id).toBe(second.id);
  });

  it("refuses to share a document that doesn't belong to the caller's organization", async () => {
    const prisma = createFakePrisma();
    const storage = createFakeStorage();
    const service = createDocumentService({
      prisma,
      storage,
      eventPublisher: createCapturingPublisher(),
      auditClient: createCapturingAuditClient(),
    });
    const orgBDoc = await service.uploadDocument("org_b", "org_b_user", fakeFile(), {});

    await expect(
      service.shareDocument("org_a", "intruder", orgBDoc.id, { userId: "someone" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
