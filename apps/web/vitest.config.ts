import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "jsdom", maxWorkers: 2, minWorkers: 1, include: ["src/**/*.test.tsx"] }, esbuild: { jsx: "automatic" } });
