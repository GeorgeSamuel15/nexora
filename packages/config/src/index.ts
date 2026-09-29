/**
 * @nexora/config
 *
 * Every service declares the environment variables it actually needs as a
 * Zod schema and loads them through `loadEnv`, which fails fast with a
 * readable error instead of letting `undefined` leak into runtime code.
 * This directly implements build spec section 24 ("validate important
 * environment variables") and section 32 ("each service should receive
 * only the configuration it needs").
 *
 * Requires `zod` to be installed (`pnpm install` at the repo root).
 */

import { z } from "zod";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Workspace runners change cwd to each package; load the root development
// file explicitly. Injected container/process variables keep precedence.
dotenv.config({
  path: process.env.NEXORA_ENV_FILE ?? fileURLToPath(new URL("../../../.env", import.meta.url)),
});

export class EnvValidationError extends Error {
  constructor(serviceName: string, issues: string[]) {
    super(`Invalid environment configuration for "${serviceName}":\n${issues.join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Parses `process.env` against the given schema. Throws EnvValidationError
 * with a readable, per-field message if anything is missing or malformed -
 * intentionally crashes on boot rather than running with bad config.
 */
export function loadEnv<TSchema extends z.ZodTypeAny>(
  serviceName: string,
  schema: TSchema,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new EnvValidationError(serviceName, issues);
  }

  return result.data;
}

/** Common variables most services need; extend per-service with `.extend()`. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
