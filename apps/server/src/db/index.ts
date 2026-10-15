import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type Schema = typeof schema;

/**
 * A database handle or an open transaction. Services take this type so the same code runs
 * inside db.transaction() and in tests that roll back after each case.
 */
export type Db = PgDatabase<NodePgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

/** Opens a connection pool. Call close() on shutdown (and at the end of scripts). */
export function createDb(databaseUrl: string, options: { max?: number } = {}) {
  const pool = new Pool({ connectionString: databaseUrl, max: options.max ?? 10 });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, close: () => pool.end() };
}

export { schema };
