import { parseArgs } from "node:util";
import { passwordSchema } from "@rsp/shared";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db/index.js";
import { loadDbEnv } from "../env.js";
import { audit } from "../modules/audit/service.js";
import { roleAssignments, users } from "../modules/auth/schema.js";
import { createUserWithPassword } from "../modules/auth/service.js";

// `pnpm admin:create --email <email> --name "<name>"`: bootstraps the first admin (direção).
// Reads the password from the first line of stdin, so it never lands in shell history:
//   printf '%s\n' "$PASSWORD" | pnpm admin:create --email ana@example.pt --name "Ana"
// If the email already has a login, only the admin role is granted. Refuses when an admin
// exists already, unless --force is given; later admins are invited from the app.

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    force: { type: "boolean", default: false },
  },
});
if (!values.email) throw new Error("Usage: admin:create --email <email> [--name <name>] [--force]");
const email = values.email.toLowerCase();

const env = loadDbEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  const [anyAdmin] = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(eq(roleAssignments.role, "admin"))
    .limit(1);
  if (anyAdmin && !values.force) {
    throw new Error("An admin exists already; invite new admins from the app (or pass --force)");
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  let userId = existing?.id;
  if (!userId) {
    if (!values.name) throw new Error("--name is required for a new user");
    const password = passwordSchema.parse(await readFirstLine());
    userId = (await createUserWithPassword(db, { email, name: values.name, password })).id;
  }
  const [alreadyAdmin] = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.userId, userId), eq(roleAssignments.role, "admin")));
  if (!alreadyAdmin) {
    await db.insert(roleAssignments).values({ userId, role: "admin" });
    await audit(db, { action: "admin.bootstrapped", subjectUserId: userId });
  }
  console.log(`${email} is an admin.`);
} finally {
  await close();
}

async function readFirstLine(): Promise<string> {
  if (process.stdin.isTTY) process.stdout.write("Password (min. 10 characters): ");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.includes("\n")) break;
  }
  return input.split(/\r?\n/)[0] ?? "";
}
