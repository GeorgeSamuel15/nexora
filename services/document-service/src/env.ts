import "dotenv/config";
import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@nexora/config";

const documentServiceEnvSchema = baseEnvSchema.extend({
  DOCUMENT_SERVICE_PORT: z.coerce.number().int().positive().default(4008),
  DOCUMENT_SERVICE_DATABASE_URL: z.string().min(1, "DOCUMENT_SERVICE_DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  DOCUMENT_STORAGE_DRIVER: z.enum(["local"]).default("local"),
  DOCUMENT_STORAGE_LOCAL_PATH: z.string().min(1).default("./storage/documents"),
  DOCUMENT_MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(25),
  RABBITMQ_URL: z.string().min(1, "RABBITMQ_URL is required"),
  AUDIT_SERVICE_INTERNAL_URL: z.string().url(),
  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(16, "INTERNAL_SERVICE_SECRET must be at least 16 characters"),
});

export const env = loadEnv("document-service", documentServiceEnvSchema);
export type DocumentServiceEnv = typeof env;
