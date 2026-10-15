import pg from "pg";

/**
 * The throwaway database used by tests: TEST_DATABASE_URL, or DATABASE_URL with "_test"
 * appended to the database name. Returns null when neither is set.
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv): string | null {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
  if (!env.DATABASE_URL) return null;
  const url = new URL(env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/^\//, "")}_test`;
  return url.toString();
}

/** Drops and recreates the database named in `url`, connecting to the server's `postgres` db. */
export async function recreateDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!/^[a-z0-9_]*_test$/.test(name)) {
    // Guard against wiping a real database through a misconfigured variable.
    throw new Error(`Refusing to recreate "${name}": test database names must end in _test`);
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}
