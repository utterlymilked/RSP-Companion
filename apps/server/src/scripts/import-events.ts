import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createDb } from "../db/index.js";
import { loadDbEnv } from "../env.js";
import { importMatches, parseMatchImport } from "../modules/events/import.js";
import { parseCsv } from "../modules/people/import.js";

// `pnpm events:import <file.csv> [--apply]`
// Reads the matches sheet (File > Download > CSV of Marcação_Jogos) into events.
// Teams and external venues are matched by name. Without --apply everything runs in a
// transaction that is rolled back, printing what would change. Output holds counts and line
// numbers only. See docs/ARCHITECTURE.md ("Calendar and events").

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { apply: { type: "boolean", default: false } },
});
const file = positionals[0];
if (!file) throw new Error("Usage: events:import <file.csv> [--apply]");

const parsed = parseMatchImport(parseCsv(await readFile(file, "utf8")));
const env = loadDbEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  const rollback = new Error("dry run");
  let summary: Awaited<ReturnType<typeof importMatches>> | undefined;
  try {
    await db.transaction(async (tx) => {
      summary = await importMatches(tx, parsed.rows);
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
