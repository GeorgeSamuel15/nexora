/**
 * Cross-checks every service's REQUIRED environment variables (those in
 * its src/env.ts with no .default() and no .optional()) against what
 * docker-compose.yml actually provides for that service.
 *
 * Catches the classic "works with `pnpm dev` and a local .env, crashes
 * instantly in Docker" bug - services fail fast on missing config by
 * design (see @nexora/config's loadEnv), so a missing compose entry is a
 * boot crash, not a subtle degradation.
 *
 * Usage: node scripts/check-compose-env.mjs   (exits non-zero on findings)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";

import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));

const composeRaw = readFileSync("docker-compose.yml", "utf8");

// Minimal YAML walk - we only need `services: <name>: environment: <KEY>: ...`
// and pulling in a YAML dependency for this one check isn't worth it.
function environmentKeysFor(serviceName) {
  const lines = composeRaw.split("\n");
  const keys = new Set();
  let inService = false;
  let inEnv = false;
  for (const line of lines) {
    if (/^  [a-z0-9-]+:\s*$/.test(line)) {
      inService = line.trim().slice(0, -1) === serviceName;
      inEnv = false;
      continue;
    }
    if (!inService) continue;
    if (/^    environment:\s*$/.test(line)) {
      inEnv = true;
      continue;
    }
    if (/^    [a-z_]+:/.test(line)) {
      inEnv = false;
      continue;
    }
    if (inEnv) {
      const m = line.match(/^      ([A-Z][A-Z0-9_]*):/);
      if (m) keys.add(m[1]);
    }
  }
  return keys;
}

let problems = 0;
for (const svc of readdirSync("services").sort()) {
  const envPath = `services/${svc}/src/env.ts`;
  if (!existsSync(envPath)) continue;

  const required = [];
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*):\s*z\.(.+?),?\s*$/);
    if (!m) continue;
    if (m[2].includes(".default(") || m[2].includes(".optional(")) continue;
    required.push(m[1]);
  }

  const provided = environmentKeysFor(svc);
  const missing = required.filter((r) => !provided.has(r));
  if (missing.length) {
    problems += missing.length;
    console.log(`${svc}:`);
    for (const m of missing) console.log(`   MISSING in docker-compose: ${m}`);
  }
}

console.log(`\n=== ${problems} missing required env var(s) in docker-compose ===`);
process.exit(problems > 0 ? 1 : 0);
