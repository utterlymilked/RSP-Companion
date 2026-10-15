import type { TestProject } from "vitest/node";
import { runMigrations } from "../db/migrate.js";
import { recreateDatabase, resolveTestDatabaseUrl } from "./database-url.js";

/**
 * Runs once before all server tests: recreates the test database from scratch and applies
 * every migration, so each run also proves the migrations work on a clean database.
 */
export default async function setup(project: TestProject) {
  const url = resolveTestDatabaseUrl(process.env);
  if (!url) {
    if (process.env.CI) {
      throw new Error("TEST_DATABASE_URL (or DATABASE_URL) must be set in CI");
    }
    console.warn(
      "\n⚠ No TEST_DATABASE_URL or DATABASE_URL: database tests are SKIPPED. " +
        "Start Postgres (docker compose up -d) and set DATABASE_URL to run them.\n",
    );
    project.provide("testDatabaseUrl", null);
    return;
  }
  await recreateDatabase(url);
  await runMigrations(url);
  project.provide("testDatabaseUrl", url);
}

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string | null;
  }
}
