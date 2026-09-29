import type { Redis } from "ioredis";

export function createFakeRedis(): Redis {
  const counters = new Map<string, number>();
  const fake = {
    status: "ready",
    incr: async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    expire: async () => 1,
    ttl: async () => 60,
  };
  return fake as unknown as Redis;
}
