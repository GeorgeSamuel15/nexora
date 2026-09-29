import { spawnSync } from "node:child_process";
let failed = false;
for (const [command, args] of [
  ["node", ["--version"]],
  ["pnpm", ["--version"]],
  ["docker", ["compose", "version"]],
]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0) {
    failed = true;
    console.error(`${command}: unavailable — ${result.error?.message ?? result.stderr.trim()}`);
  } else console.log(`${command}: ${result.stdout.trim()}`);
}
process.exitCode = failed ? 1 : 0;
