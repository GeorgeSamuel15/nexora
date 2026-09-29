import { vi } from "vitest";
import type { EventPublisher, NexoraEvent } from "@nexora/events";

export function createCapturingPublisher(): EventPublisher & { events: NexoraEvent[] } {
  const events: NexoraEvent[] = [];
  return {
    events,
    publish: vi.fn(async (event: NexoraEvent) => {
      events.push(event);
    }),
  };
}
