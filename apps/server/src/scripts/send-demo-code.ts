import { parseArgs } from "node:util";
import { loadEnv } from "../env.js";
import { createMailer } from "../mail/mailer.js";

// Runs in the staging container (Ops task `demo-code`): emails the current tester access code
// (DEMO_ACCESS_CODE, ADR 0018) to --to. The code is never printed, as the Actions logs are public.

const { values } = parseArgs({ options: { to: { type: "string" } } });
if (!values.to) throw new Error("Usage: send-demo-code --to <email>");
const env = loadEnv();
if (!env.DEMO_MODE || !env.DEMO_ACCESS_CODE) throw new Error("This stack has no demo sandbox");

await createMailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM }).send({
  to: values.to,
  subject: "SFF RSC: código de testador",
  text: `Código de testador do ambiente de testes (${env.APP_URL}):

${env.DEMO_ACCESS_CODE}

Quem testa escreve este código no ecrã de entrada para escolher uma conta de demonstração.
Não o publique; se se espalhar, peça um novo (tarefa rotate-demo-code).

Tester access code for the test environment. Enter it on the sign-in screen to pick a demo
account. Keep it private; ask for a new one if it leaks.
`,
});
console.log(`Access code sent to ${values.to}.`);
