import "dotenv/config";
import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@nexora/config";

const analyticsServiceEnvSchema = baseEnvSchema.extend({
  ANALYTICS_SERVICE_PORT: z.coerce.number().int().positive().default(4010),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(16, "INTERNAL_SERVICE_SECRET must be at least 16 characters"),
  USER_SERVICE_INTERNAL_URL: z.string().url(),
  HR_SERVICE_INTERNAL_URL: z.string().url(),
  PROJECT_SERVICE_INTERNAL_URL: z.string().url(),
  CRM_SERVICE_INTERNAL_URL: z.string().url(),
  FINANCE_SERVICE_INTERNAL_URL: z.string().url(),
});

export const env = loadEnv("analytics-service", analyticsServiceEnvSchema);
export type AnalyticsServiceEnv = typeof env;
