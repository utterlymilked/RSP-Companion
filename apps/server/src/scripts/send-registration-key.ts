import { parseArgs } from "node:util";
import { asc, eq } from "drizzle-orm";
import { createDb } from "../db/index.js";
import { loadDbEnv, loadEnv } from "../env.js";
import { createMailer } from "../mail/mailer.js";
import { roleAssignments, users } from "../modules/auth/schema.js";

// Runs in the staging container (Ops task `registration-key`): emails the current registration
// key (REGISTRATION_KEY, ADR 0026) to --to. The key is never printed: the Actions logs are public.
// Without --to it goes to the oldest login holding the admin role, read here so the address
// never appears in a log either.

const { values } = parseArgs({ options: { to: { type: "string" } } });
const env = loadEnv();
if (!env.REGISTRATION_KEY) throw new Error("This stack has no registration key");

let to = values.to;
if (!to) {
  const { db, close } = createDb(loadDbEnv().DATABASE_URL, { max: 1 });
  try {
    const [admin] = await db
      .select({ email: users.email })
      .from(roleAssignments)
      .innerJoin(users, eq(users.id, roleAssignments.userId))
      .where(eq(roleAssignments.role, "admin"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    to = admin?.email;
  } finally {
    await close();
  }
}
if (!to) throw new Error("Usage: send-registration-key [--to <email>]; no admin login found");

await createMailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM }).send({
  to,
  subject: "SFF RSC: chave de registo de testes",
  text: `Chave de registo do ambiente de testes (${env.APP_URL}):

${env.REGISTRATION_KEY}

Quem testa o registo próprio escreve esta chave no ecrã de registo. Não a publique; se se
espalhar, peça uma nova (tarefa rotate-registration-key).

Registration key for the test environment. Enter it on the sign-up screen. Keep it private;
ask for a new one if it leaks.
`,
});
console.log("Registration key sent to the chosen address.");
