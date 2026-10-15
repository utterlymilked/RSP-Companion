import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createDb } from "../db/index.js";
import { loadDbEnv } from "../env.js";
import { importBookings, parseBookingImport } from "../modules/bookings/import.js";
import { parseCsv } from "../modules/people/import.js";

// `pnpm bookings:import <file.csv> [--apply]`
// Reads the room-booking sheet (File > Download > CSV of the MARCAÇÃO tab) into bookings.
// Spaces and departments must exist already. Without --apply everything runs in a
// transaction that is rolled back, printing what would change. Output holds counts and line
// numbers only. See docs/ARCHITECTURE.md ("Rooms and fields booking").

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { apply: { type: "boolean", default: false } },
});
const file = positionals[0];
if (!file) throw new Error("Usage: bookings:import <file.csv> [--apply]");

const parsed = parseBookingImport(parseCsv(await readFile(file, "utf8")));
const env = loadDbEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  const rollback = new Error("dry run");
  let summary: Awaited<ReturnType<typeof importBookings>> | undefined;
  try {
    await db.transaction(async (tx) => {
      summary = await importBookings(tx, parsed.rows);
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
