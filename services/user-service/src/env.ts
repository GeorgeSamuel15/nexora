import "dotenv/config";
import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@nexora/config";

const userServiceEnvSchema = baseEnvSchema.extend({
  USER_SERVICE_PORT: z.coerce.number().int().positive().default(4003),
  USER_SERVICE_DATABASE_URL: z.string().min(1, "USER_SERVICE_DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  AUDIT_SERVICE_INTERNAL_URL: z.string().url(),
  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(16, "INTERNAL_SERVICE_SECRET must be at least 16 characters"),
});

export const env = loadEnv("user-service", userServiceEnvSchema);
export type UserServiceEnv = typeof env;
