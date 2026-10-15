import { createDb } from "../db/index.js";
import { seed, truncateAll } from "../db/seed.js";
import { loadEnv } from "../env.js";
import { organisations } from "../modules/organisations/schema.js";

// `pnpm db:seed [--reset]`: fills DATABASE_URL with fake development data.
// Refuses to run in production, and on a non-empty database unless --reset is given.
const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("Refusing to seed a production database");

const reset = process.argv.includes("--reset");
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: organisations.id }).from(organisations).limit(1);
    if (existing.length > 0 && !reset) {
      throw new Error("Database already has data; run `pnpm db:seed --reset` to replace it");
    }
    if (reset) await truncateAll(tx);
    await seed(tx);
  });
  console.log("Seed data inserted.");
} finally {
  await close();
}
