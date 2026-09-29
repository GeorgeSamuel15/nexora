import { spawnSync } from "node:child_process";
const result = spawnSync("pnpm", process.argv.slice(2), {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
