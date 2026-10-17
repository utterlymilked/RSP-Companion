import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db/index.js";
import { loadDbEnv } from "../env.js";
import { audit } from "../modules/audit/service.js";
import { roleAssignments, users } from "../modules/auth/schema.js";

// `grant-developer --email <email>` (Ops task `grant-developer`): gives an existing login the
// club-wide `developer` role (ADR 0019). The app itself never grants or revokes it, so the
// role stays with whoever runs the server. Idempotent; the user must already exist.

const { values } = parseArgs({ options: { email: { type: "string" } } });
if (!values.email) throw new Error("Usage: grant-developer --email <email>");
const email = values.email.toLowerCase();

const { db, close } = createDb(loadDbEnv().DATABASE_URL, { max: 1 });
try {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`No login for ${email}: create or invite the account first`);
  const [held] = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.userId, user.id), eq(roleAssignments.role, "developer")));
  if (!held) {
    await db.insert(roleAssignments).values({ userId: user.id, role: "developer" });
    await audit(db, {
      action: "role.granted",
      subjectUserId: user.id,
      details: { role: "developer" },
    });
  }
  console.log(`${email} is a developer.`);
} finally {
  await close();
}
