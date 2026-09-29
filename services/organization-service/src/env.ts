import "dotenv/config";
import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@nexora/config";

const organizationServiceEnvSchema = baseEnvSchema.extend({
  ORGANIZATION_SERVICE_PORT: z.coerce.number().int().positive().default(4002),
  ORGANIZATION_SERVICE_DATABASE_URL: z
    .string()
    .min(1, "ORGANIZATION_SERVICE_DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(16, "INTERNAL_SERVICE_SECRET must be at least 16 characters"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  RABBITMQ_URL: z.string().min(1, "RABBITMQ_URL is required"),
  AUDIT_SERVICE_INTERNAL_URL: z.string().url(),
});

export const env = loadEnv("organization-service", organizationServiceEnvSchema);
export type OrganizationServiceEnv = typeof env;
