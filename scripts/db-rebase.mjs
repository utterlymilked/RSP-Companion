#!/usr/bin/env node
// Re-creates your unmerged migration on top of origin/main, replacing the hand merge of
// `_journal.json` and the snapshot that parallel threads keep getting wrong.
//   git fetch origin main && git merge origin/main   (resolve the drizzle/ conflicts any way)
//   pnpm db:rebase
// It keeps your SQL (including hand edits), resets drizzle/ to origin/main, regenerates the
// snapshot and journal entry with the next free number, and puts your SQL back.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = "apps/server/drizzle";
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const sqlOf = (ref) =>
  run("git", ["ls-tree", "--name-only", ref, `${dir}/`])
    .split("\n")
    .map((p) => p.slice(dir.length + 1))
    .filter((f) => f.endsWith(".sql"));

const base = sqlOf("origin/main");
const baseNames = new Set(base.map((f) => f.replace(/^\d{4}_/, "")));
const baseMax = Math.max(...base.map((f) => Number(f.slice(0, 4))));
// Mine: SQL files in the working tree that origin/main does not have under the same name.
const mine = readdirSync(join(root, dir))
  .filter((f) => f.endsWith(".sql") && !base.includes(f))
  .sort();

if (mine.length === 0) {
  console.log("No unmerged migration: nothing to rebase.");
  process.exit(0);
}
const kept = mine.map((f) => ({
  name: f.replace(/^\d{4}_/, "").replace(/\.sql$/, ""),
  sql: readFileSync(join(root, dir, f), "utf8"),
}));
for (const k of kept) {
  if (baseNames.has(`${k.name}.sql`)) {
    console.error(`origin/main already has a migration named ${k.name}; rename yours first.`);
    process.exit(1);
  }
}

// Drizzle's generate diffs the schema against the last snapshot, so each migration's schema
// change must be generated separately; with several, only the last one can be reconstructed.
if (kept.length > 1) {
  console.error(
    "More than one unmerged migration: merge them into one file first, then run again.",
  );
  process.exit(1);
}

run("git", ["checkout", "origin/main", "--", dir]);
run("git", ["clean", "-fdq", "--", dir]);
const [k] = kept;
run("pnpm", ["db:generate", "--name", k.name]);
const fresh = readdirSync(join(root, dir)).find((f) => f.endsWith(`_${k.name}.sql`));
if (!fresh) {
  console.error("db:generate produced no migration: your schema already matches origin/main.");
  process.exit(1);
}
writeFileSync(join(root, dir, fresh), k.sql);
console.log(
  `Rebased as ${fresh} (origin/main was at ${String(baseMax).padStart(4, "0")}). Run pnpm check.`,
);
