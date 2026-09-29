import "dotenv/config";
import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@nexora/config";

const notificationServiceEnvSchema = baseEnvSchema.extend({
  INTERNAL_SERVICE_SECRET: z.string().min(16),
  NOTIFICATION_SERVICE_PORT: z.coerce.number().int().positive().default(4009),
  NOTIFICATION_SERVICE_DATABASE_URL: z
    .string()
    .min(1, "NOTIFICATION_SERVICE_DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  RABBITMQ_URL: z.string().min(1, "RABBITMQ_URL is required"),
});

export const env = loadEnv("notification-service", notificationServiceEnvSchema);
export type NotificationServiceEnv = typeof env;
