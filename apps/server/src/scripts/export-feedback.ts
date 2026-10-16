import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { FEEDBACK_STATUSES, feedbackToMarkdown } from "@rsc/shared";
import { createDb } from "../db/index.js";
import { loadDbEnv } from "../env.js";
import { listFeedback } from "../modules/feedback/service.js";

// `pnpm feedback:export [--status open|new|seen|done] [--out docs/feedback]`: writes the
// collected tester feedback as Markdown (one file per day, `YYYY-MM-DD.md`). Without --out
// it prints to stdout, which is how the Ops task `export-feedback` runs it on the server;
// a session saves that output under docs/feedback/ (see docs/feedback/README.md).

const { values } = parseArgs({
  options: { status: { type: "string", default: "open" }, out: { type: "string" } },
});
const status = values.status as (typeof FEEDBACK_STATUSES)[number] | "open";
if (status !== "open" && !FEEDBACK_STATUSES.includes(status)) {
  throw new Error("--status must be open, new, seen or done");
}

const { db, close } = createDb(loadDbEnv().DATABASE_URL, { max: 1 });
try {
  const now = new Date();
  const markdown = feedbackToMarkdown(await listFeedback(db, { status, limit: 500 }), now);
  if (values.out) {
    await mkdir(values.out, { recursive: true });
    const file = join(values.out, `${now.toISOString().slice(0, 10)}.md`);
    await writeFile(file, markdown);
    console.log(`Wrote ${file}`);
  } else {
    process.stdout.write(markdown);
  }
} finally {
  await close();
}
