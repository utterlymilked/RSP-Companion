import { afterAll, describe, inject } from "vitest";
import { createDb, type Db } from "../db/index.js";

const url = inject("testDatabaseUrl");
const connection = url ? createDb(url, { max: 4 }) : null;

afterAll(async () => {
  await connection?.close();
});

/** `describe` for suites that need Postgres; skipped (with a warning) when none is configured. */
export const describeDb = describe.skipIf(!connection);

class Rollback extends Error {}

/**
 * Runs `fn` in a transaction that is always rolled back, so tests never see each other's
 * rows and need no cleanup. Use `savepoint` to assert that a statement fails without
 * aborting the rest of the test.
 */
export async function withRollback(fn: (db: Db) => Promise<void>): Promise<void> {
  if (!connection) throw new Error("No test database configured");
  try {
    await connection.db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/** Runs `fn` in a nested transaction (savepoint) and returns the error it throws, if any. */
export async function savepoint(db: Db, fn: (db: Db) => Promise<unknown>): Promise<unknown> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
    });
    return undefined;
  } catch (error) {
    return error;
  }
}

export { pgCode } from "../db/errors.js";
