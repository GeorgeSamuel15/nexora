import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
const target = new URL("../.env", import.meta.url);
if (existsSync(target)) {
  console.log(".env already exists; nothing overwritten.");
} else {
  let template = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  for (const name of ["JWT_SECRET", "JWT_REFRESH_SECRET", "INTERNAL_SERVICE_SECRET"]) {
    template = template.replace(
      new RegExp(`^${name}=.*$`, "m"),
      `${name}=${randomBytes(32).toString("hex")}`,
    );
  }
  writeFileSync(target, template, { mode: 0o600, flag: "wx" });
  console.log("Created .env for local development with randomly generated application secrets.");
}
