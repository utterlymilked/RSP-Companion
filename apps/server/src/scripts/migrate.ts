import { runMigrations } from "../db/migrate.js";
import { loadDbEnv } from "../env.js";

// `pnpm db:migrate`: applies pending migrations to DATABASE_URL.
const env = loadDbEnv();
await runMigrations(env.DATABASE_URL);
console.log("Migrations applied.");
