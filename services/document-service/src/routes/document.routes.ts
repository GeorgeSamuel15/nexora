import { routeId } from "@nexora/http";
import type { Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import type { TokenConfig } from "@nexora/auth";
import { asyncHandler } from "@nexora/utils";
import {
  authenticate,
  requirePermission,
  validateBody,
  validateQuery,
  UnauthorizedError,
  ValidationError,
} from "@nexora/http";
import { apiSuccess } from "@nexora/types";
import type { DocumentService } from "../services/document.service.js";
import {
  listDocumentsQuerySchema,
  renameDocumentSchema,
  shareDocumentSchema,
  uploadMetadataSchema,
  type ListDocumentsQuery,
} from "../validation/document.schemas.js";
export interface DocumentRouterConfig {
  maxUploadSizeBytes: number;
}
export function createDocumentRouter(
  documentService: DocumentService,
  tokenConfig: Pick<TokenConfig, "accessTokenSecret">,
  config: DocumentRouterConfig,
): Router {
  const router = Router();
  const requireAuth = authenticate(tokenConfig);
  const requireUpload = requirePermission("document.upload");
  const requireRead = requirePermission("document.read");
  const requireDelete = requirePermission("document.delete");
  // Memory storage, not disk - our own StorageDriver abstraction owns
  // where bytes actually end up (build spec section 15). multer only
  // handles parsing the multipart request into a buffer.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadSizeBytes },
  });
  router.post(
    "/",
    requireAuth,
    requireUpload,
    upload.single("file"),
    validateBody(uploadMetadataSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const file = (
        req as Request & {
          file?: unknown;
        }
      ).file as
        | {
            originalname: string;
            mimetype: string;
            size: number;
            buffer: Buffer;
          }
        | undefined;
      if (!file) {
        throw new ValidationError("A file is required (multipart field name: 'file').");
      }
      const document = await documentService.uploadDocument(
        req.auth.organizationId,
        req.auth.userId,
        {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          buffer: file.buffer,
        },
        req.body,
      );
      res.status(201).json(apiSuccess(document));
    }),
  );
  router.get(
    "/",
    requireAuth,
    requireRead,
    validateQuery(listDocumentsQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const query = (
        req as Request & {
          validatedQuery: ListDocumentsQuery;
        }
      ).validatedQuery;
      const result = await documentService.listDocuments(req.auth.organizationId, query);
      res.status(200).json(apiSuccess(result));
    }),
  );
  router.get(
    "/:id",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const document = await documentService.getDocumentOrThrow(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess(document));
    }),
  );
  router.get(
    "/:id/download",
    requireAuth,
    requireRead,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const { document, buffer } = await documentService.downloadDocument(
        req.auth.organizationId,
        routeId(req, "id"),
      );
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(document.fileName)}"`,
      );
      res.status(200).send(buffer);
    }),
  );
  router.patch(
    "/:id",
    requireAuth,
    requireUpload,
    validateBody(renameDocumentSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const document = await documentService.renameDocument(
        req.auth.organizationId,
        routeId(req, "id"),
        req.body,
      );
      res.status(200).json(apiSuccess(document));
    }),
  );
  router.post(
    "/:id/share",
    requireAuth,
    requireUpload,
    validateBody(shareDocumentSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      const share = await documentService.shareDocument(
        req.auth.organizationId,
        req.auth.userId,
        routeId(req, "id"),
        req.body,
      );
      res.status(201).json(apiSuccess(share));
    }),
  );
  router.delete(
    "/:id",
    requireAuth,
    requireDelete,
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) throw new UnauthorizedError();
      await documentService.deleteDocument(
        req.auth.organizationId,
        req.auth.userId,
        routeId(req, "id"),
      );
      res.status(200).json(apiSuccess({ deleted: true }));
    }),
  );
  return router;
}
