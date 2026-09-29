import { PrismaClient } from "../generated/client/index.js";
import { createSingleton } from "@nexora/database";

export const db = createSingleton("hr-service-db", () => new PrismaClient());
