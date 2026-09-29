import { PrismaClient } from "../generated/client/index.js";
import { createSingleton } from "@nexora/database";

export const db = createSingleton("project-service-db", () => new PrismaClient());
