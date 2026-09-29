import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "./browser", timeout: 60000, use: { baseURL: process.env.WEB_URL ?? "http://localhost:5173", trace: "retain-on-failure" }, projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }], reporter: [["list"], ["html", { open: "never" }]] });
