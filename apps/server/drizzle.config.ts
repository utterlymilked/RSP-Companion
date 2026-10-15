import { defineConfig } from "drizzle-kit";

// Used by `pnpm db:generate` (and `db:check`). Generation needs no database connection;
// migrations are applied by src/scripts/migrate.ts, not by drizzle-kit.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
  verbose: true,
});
