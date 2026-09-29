import "dotenv/config";
import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@nexora/config";

const authServiceEnvSchema = baseEnvSchema.extend({
  AUTH_SERVICE_PORT: z.coerce.number().int().positive().default(4001),
  AUTH_SERVICE_DATABASE_URL: z.string().min(1, "AUTH_SERVICE_DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_ACCESS_TOKEN_TTL: z.string().default("15m"),
  JWT_REFRESH_TOKEN_TTL: z.string().default("30d"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  ORGANIZATION_SERVICE_INTERNAL_URL: z.string().url(),
  AUDIT_SERVICE_INTERNAL_URL: z.string().url(),
  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(16, "INTERNAL_SERVICE_SECRET must be at least 16 characters"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
});

export const env = loadEnv("auth-service", authServiceEnvSchema);
export type AuthServiceEnv = typeof env;
