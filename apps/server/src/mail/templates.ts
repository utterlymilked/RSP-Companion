import type { Mail } from "./mailer.js";

// Email copy is UI copy: Portuguese first, English below it, until users have a locale (M3).

const footer =
  "Se não pediu este email, pode ignorá-lo.\nIf you did not ask for this email, you can ignore it.";

export function invitationMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Convite para o RSC Companion / Invitation to RSC Companion",
    text: [
      "Foi convidado para o RSC Companion, a app do Real Sport Clube Massamá.",
      `Para criar a sua conta, abra este link (válido 7 dias):\n${url}`,
      "You have been invited to RSC Companion, the Real Sport Clube Massamá app.",
      "To create your account, open the link above (valid for 7 days).",
      footer,
    ].join("\n\n"),
  };
}

export function resetPasswordMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Redefinir palavra-passe / Reset your password",
    text: [
      `Para definir uma nova palavra-passe, abra este link (válido 1 hora):\n${url}`,
      "To set a new password, open the link above (valid for 1 hour).",
      footer,
    ].join("\n\n"),
  };
}

export function magicLinkMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Entrar no RSC Companion / Sign in to RSC Companion",
    text: [
      `Para entrar, abra este link (válido 10 minutos):\n${url}`,
      "To sign in, open the link above (valid for 10 minutes).",
      footer,
    ].join("\n\n"),
  };
}
