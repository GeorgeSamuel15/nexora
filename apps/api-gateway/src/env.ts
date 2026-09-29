import "dotenv/config";
import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@nexora/config";

const apiGatewayEnvSchema = baseEnvSchema.extend({
  API_GATEWAY_PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  AUTH_SERVICE_URL: z.string().url(),
  ORGANIZATION_SERVICE_URL: z.string().url(),
  USER_SERVICE_URL: z.string().url(),
  HR_SERVICE_URL: z.string().url(),
  PROJECT_SERVICE_URL: z.string().url(),
  CRM_SERVICE_URL: z.string().url(),
  FINANCE_SERVICE_URL: z.string().url(),
  DOCUMENT_SERVICE_URL: z.string().url(),
  NOTIFICATION_SERVICE_URL: z.string().url(),
  ANALYTICS_SERVICE_URL: z.string().url(),
  AUDIT_SERVICE_URL: z.string().url(),
});

export const env = loadEnv("api-gateway", apiGatewayEnvSchema);
export type ApiGatewayEnv = typeof env;
