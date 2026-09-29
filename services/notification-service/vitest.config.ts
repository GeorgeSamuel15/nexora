import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 2,
    minWorkers: 1,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
