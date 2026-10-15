import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { createDb } from "../db/index.js";
import { loadDbEnv } from "../env.js";
import { organisations } from "../modules/organisations/schema.js";
import { importRows, parseCsv, parseImport } from "../modules/people/import.js";
import { getCurrentSeason } from "../modules/seasons/service.js";

// `pnpm people:import <file.csv> [--organisation <name>] [--season <name>] [--apply]`
// Reads a CSV exported from the club's spreadsheets (File > Download > CSV) and loads people,
// member numbers, guardians and team / class rosters. Without --apply it does everything in
// a transaction and rolls it back, printing what would change. Output holds counts and line
// numbers only, never personal data. See docs/ARCHITECTURE.md ("Importing people").

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    organisation: { type: "string" },
    season: { type: "string" },
    apply: { type: "boolean", default: false },
  },
});
const file = positionals[0];
if (!file) {
  throw new Error(
    "Usage: people:import <file.csv> [--organisation <name>] [--season <name>] [--apply]",
  );
}

const parsed = parseImport(parseCsv(await readFile(file, "utf8")));
const env = loadDbEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  const organisation = values.organisation
    ? (await db.select().from(organisations).where(eq(organisations.name, values.organisation)))[0]
    : undefined;
  if (values.organisation && !organisation)
    throw new Error(`Unknown organisation "${values.organisation}"`);
  const season = await getCurrentSeason(db);
  const today = new Date().toISOString().slice(0, 10);

  const rollback = new Error("dry run");
  let summary: Awaited<ReturnType<typeof importRows>> | undefined;
  try {
    await db.transaction(async (tx) => {
      summary = await importRows(tx, parsed.rows, {
        organisationId: organisation?.id,
        seasonId: season?.id,
        today,
      });
      if (!values.apply) throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  if (!summary) throw new Error("Import did not run");
  const issues = [...parsed.issues, ...summary.issues];
  const { issues: _ignored, ...counts } = summary;
  console.log(values.apply ? "Applied:" : "Dry run (nothing written; add --apply):", counts);
  for (const issue of issues) console.log(`line ${issue.line}: ${issue.message}`);
  if (issues.length > 0) console.log(`${issues.length} row(s) skipped or flagged.`);
} finally {
  await close();
}
