import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Real bcrypt work can exceed 5s when CI builds run concurrently.
    testTimeout: 15000,
    maxWorkers: 2,
    minWorkers: 1,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
