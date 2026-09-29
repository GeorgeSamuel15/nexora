import { z } from "zod";
import { buildListQuerySchema, nonEmptyString, uuidSchema } from "@nexora/validation";

/** Accompanies the uploaded file as form fields (multipart/form-data) -
 * multer puts the file itself on req.file, everything else on req.body
 * as strings, hence the coercion-friendly shape here. */
export const uploadMetadataSchema = z.object({
  category: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
});
export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;

export const listDocumentsQuerySchema = buildListQuerySchema({
  category: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
  search: z.string().trim().max(200).optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const renameDocumentSchema = z.object({
  name: nonEmptyString.max(255),
});
export type RenameDocumentInput = z.infer<typeof renameDocumentSchema>;

export const shareDocumentSchema = z.object({
  userId: uuidSchema,
});
export type ShareDocumentInput = z.infer<typeof shareDocumentSchema>;
