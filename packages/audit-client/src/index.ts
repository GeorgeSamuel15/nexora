/**
 * @nexora/audit-client
 *
 * Shared client every service uses to record audit entries (build spec
 * section 4: "Audit Service... Record important actions"). Deliberately
 * best-effort and non-blocking - a failure to write an audit log is a
 * problem worth logging, but it must never be the reason a login, an
 * invoice update, or an employee record change fails. Same philosophy as
 * @nexora/events' EventPublisher: depend on the interface, swap the
 * transport, business logic never touches HTTP/RabbitMQ/whatever
 * directly.
 */

export interface AuditEntry {
  organizationId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditClient {
  record(entry: AuditEntry): Promise<void>;
}

interface AuditLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface HttpAuditClientConfig {
  auditServiceUrl: string;
  internalSecret: string;
}

/** Real implementation - POSTs to audit-service's internal endpoint.
 * Never throws: a down audit-service should never take an actual
 * business operation down with it. */
export function createHttpAuditClient(
  config: HttpAuditClientConfig,
  logger: AuditLogger,
): AuditClient {
  return {
    async record(entry) {
      try {
        const response = await fetch(`${config.auditServiceUrl}/internal/audit-logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": config.internalSecret,
          },
          body: JSON.stringify(entry),
        });
        if (!response.ok) {
          logger.warn("audit-service rejected an audit entry", {
            status: response.status,
            action: entry.action,
          });
        }
      } catch (err) {
        logger.warn("could not reach audit-service to record an audit entry", {
          action: entry.action,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

/** For tests, local dev without audit-service running, or as a fallback -
 * logs what would have been recorded instead of silently discarding it. */
export function createNoopAuditClient(logger: AuditLogger): AuditClient {
  return {
    async record(entry) {
      logger.info(
        "audit entry ready to record (audit-service call not wired here - see @nexora/audit-client)",
        {
          action: entry.action,
          entityType: entry.entityType,
        },
      );
    },
  };
}
