import { createTransport } from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Sends transactional email (invitations, password resets, magic links). */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** SMTP when `smtpUrl` is set; otherwise prints each email to the console (development). */
export function createMailer(options: { smtpUrl?: string; from: string }): Mailer {
  const { smtpUrl, from } = options;
  if (!smtpUrl) {
    return {
      async send(mail) {
        console.log(`\n📧 To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
      },
    };
  }
  const transport = createTransport(smtpUrl);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

/** Keeps sent emails in memory, for tests. */
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}
