/**
 * @nexora/logger
 *
 * Structured JSON logging shared by every service, per build spec section 26.
 * Deliberately zero external dependencies so this package works immediately
 * without `pnpm install` - swap the `write` sink for pino/winston later if
 * desired without changing call sites.
 *
 * Always includes: level, time, service, msg, and whatever request context
 * is bound in (requestId, method, route, statusCode, duration, userId,
 * organizationId). Never logs passwords or tokens - see REDACTED_KEYS.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RequestLogContext {
  requestId?: string;
  service?: string;
  method?: string;
  route?: string;
  statusCode?: number;
  durationMs?: number;
  userId?: string;
  organizationId?: string;
}

const REDACTED_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "rawToken",
  "tokenHash",
  "accessToken",
  "refreshToken",
  "authorization",
  "secret",
  "jwtSecret",
  "jwtRefreshSecret",
]);

const REDACTED_VALUE = "[REDACTED]";

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key) ? REDACTED_VALUE : redact(val);
    }
    return out;
  }
  return value;
}

interface LogRecord extends RequestLogContext {
  level: LogLevel;
  time: string;
  msg: string;
  [extra: string]: unknown;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  /** Returns a child logger with additional context pre-bound (e.g. per-request). */
  child(context: RequestLogContext): Logger;
}

function write(record: LogRecord): void {
  // stdout, one JSON object per line - friendly to log aggregators.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(record));
}

function createLoggerWithContext(baseContext: RequestLogContext): Logger {
  const log = (level: LogLevel, msg: string, meta?: Record<string, unknown>): void => {
    const record: LogRecord = {
      level,
      time: new Date().toISOString(),
      msg,
      ...baseContext,
      ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
    };
    write(record);
  };

  return {
    debug: (msg, meta) => log("debug", msg, meta),
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
    child: (context) => createLoggerWithContext({ ...baseContext, ...context }),
  };
}

/** Create a root logger for a service, e.g. `createLogger("auth-service")`. */
export function createLogger(service: string): Logger {
  return createLoggerWithContext({ service });
}
