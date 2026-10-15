import { runMigrations } from "../db/migrate.js";
import { loadEnv } from "../env.js";

// `pnpm db:migrate`: applies pending migrations to DATABASE_URL.
const env = loadEnv();
await runMigrations(env.DATABASE_URL);
console.log("Migrations applied.");
