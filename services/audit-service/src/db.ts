import { PrismaClient } from "../generated/client/index.js";
import { createSingleton } from "@nexora/database";

export const db = createSingleton("audit-service-db", () => new PrismaClient());
