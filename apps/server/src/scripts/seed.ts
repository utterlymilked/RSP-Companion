import { createDb } from "../db/index.js";
import { DEMO_LOGINS, DEV_PASSWORD, seed, truncateAll } from "../db/seed.js";
import { loadDbEnv } from "../env.js";
import { organisations } from "../modules/organisations/schema.js";

// `pnpm db:seed [--reset]`: fills DATABASE_URL with fake demo data (people, teams, a season of
// trainings and matches, call-ups, fees, economato, incidents, announcements) and demo logins.
// Refuses a non-empty database unless --reset is given (development only).
// Staging: `node dist/scripts/seed.js --allow-production` with SEED_PASSWORD set, run by the
// Ops workflow's seed-demo task; it never resets and never touches existing accounts.
const env = loadDbEnv();
const production = env.NODE_ENV === "production";
const reset = process.argv.includes("--reset");
if (production && !process.argv.includes("--allow-production")) {
  throw new Error("Refusing to seed a production database without --allow-production");
}
if (production && reset) throw new Error("--reset is for development databases only");
const password = process.env.SEED_PASSWORD || (production ? "" : DEV_PASSWORD);
if (password.length < 12) throw new Error("Set SEED_PASSWORD (at least 12 characters)");

const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: organisations.id }).from(organisations).limit(1);
    if (existing.length > 0 && !reset) {
      throw new Error(
        production
          ? "The database already has club data; demo data only goes into an empty one"
          : "Database already has data; run `pnpm db:seed --reset` to replace it",
      );
    }
    if (reset) await truncateAll(tx);
    await seed(tx, { password });
  });
  console.log("Demo data inserted. Logins (all with the same password):");
  for (const login of DEMO_LOGINS) console.log(`  ${login.email}  ${login.name}`);
  if (!production) console.log(`Password: ${DEV_PASSWORD}`);
} finally {
  await close();
}
