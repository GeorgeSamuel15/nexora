import { vi } from "vitest";
import type { AuditClient, AuditEntry } from "@nexora/audit-client";

export function createCapturingAuditClient(): AuditClient & { entries: AuditEntry[] } {
  const entries: AuditEntry[] = [];
  return {
    entries,
    record: vi.fn(async (entry: AuditEntry) => {
      entries.push(entry);
    }),
  };
}
