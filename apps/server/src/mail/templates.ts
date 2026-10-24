import type { Mail } from "./mailer.js";

// Email copy is UI copy: Portuguese first, English below it, until users have a locale (M3).

const footer =
  "Se não pediu este email, pode ignorá-lo.\nIf you did not ask for this email, you can ignore it.";

export function invitationMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Convite para o SFF RSC / Invitation to SFF RSC",
    text: [
      "Foi convidado para o SFF RSC, a app do Real Sport Clube Massamá.",
      `Para criar a sua conta, abra este link (válido 7 dias):\n${url}`,
      "You have been invited to SFF RSC, the Real Sport Clube Massamá app.",
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
    subject: "Entrar no SFF RSC / Sign in to SFF RSC",
    text: [
      `Para entrar, abra este link (válido 10 minutos):\n${url}`,
      "To sign in, open the link above (valid for 10 minutes).",
      footer,
    ].join("\n\n"),
  };
}

export function verifyEmailMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Confirme o seu email / Confirm your email",
    text: [
      `Para confirmar o seu email e ativar a conta, abra este link (válido 24 horas):\n${url}`,
      "To confirm your email and activate your account, open the link above (valid for 24 hours).",
      footer,
    ].join("\n\n"),
  };
}

const OUTCOME_PT = {
  approved: "aprovado",
  rejected: "recusado",
  needs_info: "a precisar de mais informação",
};
const OUTCOME_EN = {
  approved: "approved",
  rejected: "rejected",
  needs_info: "waiting for more information",
};

export function approvalDecidedMail(
  to: string,
  outcome: "approved" | "rejected" | "needs_info",
  reason?: string,
): Mail {
  return {
    to,
    subject: "O seu pedido foi decidido / Your request was decided",
    text: [
      `O seu pedido no SFF RSC foi ${OUTCOME_PT[outcome]}.${reason ? `\nMotivo: ${reason}` : ""}\nAbra a app para ver os detalhes.`,
      `Your request in SFF RSC is ${OUTCOME_EN[outcome]}.${reason ? `\nReason: ${reason}` : ""}\nOpen the app for details.`,
      footer,
    ].join("\n\n"),
  };
}

export function approvalsWaitingMail(to: string, count: number, appUrl: string): Mail {
  return {
    to,
    subject: "Pedidos à espera de decisão / Requests waiting for a decision",
    text: [
      `Há ${count} pedido(s) à espera de decisão no SFF RSC há mais de um dia: ${appUrl}`,
      `${count} request(s) have been waiting for a decision in SFF RSC for over a day: ${appUrl}`,
    ].join("\n\n"),
  };
}

/** Warns a login that it will be deleted or deactivated for inactivity (ADR 0026 section 9). */
export function inactivityWarningMail(
  to: string,
  action: "delete" | "deactivate",
  daysLeft: number,
  appUrl: string,
): Mail {
  const pt =
    action === "delete"
      ? `A sua conta no SFF RSC vai ser apagada dentro de ${daysLeft} dias por falta de utilização. Para a manter, basta iniciar sessão: ${appUrl}`
      : `A sua conta no SFF RSC vai ser desativada dentro de ${daysLeft} dias por falta de utilização. Para a manter, basta iniciar sessão: ${appUrl}`;
  const en =
    action === "delete"
      ? `Your SFF RSC account will be deleted in ${daysLeft} days because it has not been used. Sign in to keep it: ${appUrl}`
      : `Your SFF RSC account will be deactivated in ${daysLeft} days because it has not been used. Sign in to keep it: ${appUrl}`;
  return {
    to,
    subject:
      "A sua conta vai ser removida por inatividade / Your account will be removed for inactivity",
    text: `${pt}\n\n${en}`,
  };
}
