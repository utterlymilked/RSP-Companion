#!/usr/bin/env node
// Numbered files are the main merge-conflict hotspot when threads work in parallel.
//   node scripts/numbers.mjs next    next free migration and ADR number (default)
//   node scripts/numbers.mjs check   fail on duplicate numbers or a journal that does not match
// `next` looks at the working tree and at origin/main (run `git fetch origin main` first) and
// uses whichever is higher, so claim a number only when you are about to commit it.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KINDS = {
  migration: { dir: "apps/server/drizzle", pattern: /^(\d{4})_.+\.sql$/ },
  adr: { dir: "docs/adr", pattern: /^(\d{4})-.+\.md$/ },
};

const git = (...args) => {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

const local = ({ dir, pattern }) =>
  readdirSync(join(root, dir)).flatMap((f) =>
    pattern.test(f) ? [{ n: Number(f.slice(0, 4)), f }] : [],
  );

const onMain = ({ dir, pattern }) => {
  const out = git("ls-tree", "--name-only", "origin/main", `${dir}/`);
  if (out === null) return null;
  return out
    .split("\n")
    .map((p) => p.slice(dir.length + 1))
    .flatMap((f) => (pattern.test(f) ? [{ n: Number(f.slice(0, 4)), f }] : []));
};

const pad = (n) => String(n).padStart(4, "0");

function next() {
  let behind = false;
  for (const [kind, spec] of Object.entries(KINDS)) {
    const mine = local(spec);
    const theirs = onMain(spec);
    if (theirs === null)
      console.error("origin/main not found: run `git fetch origin main` for an accurate answer.");
    const max = Math.max(0, ...mine.map((x) => x.n), ...(theirs ?? []).map((x) => x.n));
    console.log(`next ${kind}: ${pad(max + 1)}`);
    if (theirs?.some((x) => !mine.some((m) => m.f === x.f))) behind = true;
  }
  if (behind) console.log("origin/main has files you do not: merge it before claiming a number.");
}

function check() {
  const errors = [];
  for (const [kind, spec] of Object.entries(KINDS)) {
    const seen = new Map();
    for (const { n, f } of local(spec)) seen.set(n, [...(seen.get(n) ?? []), f]);
    for (const [n, files] of seen) {
      if (files.length > 1) errors.push(`duplicate ${kind} number ${pad(n)}: ${files.join(", ")}`);
    }
  }
  const journal = JSON.parse(
    readFileSync(join(root, KINDS.migration.dir, "meta/_journal.json"), "utf8"),
  );
  const files = new Set(local(KINDS.migration).map((x) => x.f.replace(/\.sql$/, "")));
  for (const e of journal.entries) {
    if (!files.has(e.tag)) errors.push(`journal entry ${e.tag} has no SQL file`);
    if (!e.tag.startsWith(pad(e.idx))) errors.push(`journal entry ${e.tag} sits at idx ${e.idx}`);
  }
  for (const f of files) {
    if (!journal.entries.some((e) => e.tag === f))
      errors.push(`${f}.sql is not in the migration journal`);
  }
  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    console.error("Fix: `pnpm db:rebase` renumbers your migration on top of origin/main.");
    process.exit(1);
  }
  console.log("Migration and ADR numbers are consistent.");
}

const cmd = process.argv[2] ?? "next";
if (cmd === "next") next();
else if (cmd === "check") check();
else {
  console.error("usage: numbers.mjs [next|check]");
  process.exit(2);
}
