import { parseArgs } from "node:util";
import { loadEnv } from "../env.js";
import { createMailer } from "../mail/mailer.js";

// Runs in the staging container (Ops task `registration-key`): emails the current registration
// key (REGISTRATION_KEY, ADR 0026) to --to. The key is never printed: the Actions logs are public.

const { values } = parseArgs({ options: { to: { type: "string" } } });
if (!values.to) throw new Error("Usage: send-registration-key --to <email>");
const env = loadEnv();
if (!env.REGISTRATION_KEY) throw new Error("This stack has no registration key");

await createMailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM }).send({
  to: values.to,
  subject: "SFF RSC: chave de registo de testes",
  text: `Chave de registo do ambiente de testes (${env.APP_URL}):

${env.REGISTRATION_KEY}

Quem testa o registo próprio escreve esta chave no ecrã de registo. Não a publique; se se
espalhar, peça uma nova (tarefa rotate-registration-key).

Registration key for the test environment. Enter it on the sign-up screen. Keep it private;
ask for a new one if it leaks.
`,
});
console.log(`Registration key sent to ${values.to}.`);
