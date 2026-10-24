import { z } from "zod";
import { AUDIT_ACTIONS } from "./audit.ts";

/**
 * Consents the club records besides health (which has its own, ADR 0008). Each is given by
 * the person, or by a guardian while the person is a minor, and can be withdrawn at any time.
 * Adding a kind needs a migration (it is a Postgres enum).
 */
export const CONSENT_KINDS = [
  "image_rights", // photos and video in club channels (site, social media, posters)
  "transport", // travelling with the club or in other families' cars (carpools, M16)
] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Under this age a guardian gives consent; from it on, only the person themself. */
export const CONSENT_AGE = 18;

const day = z.iso.date();

/** Body of POST /api/privacy/people/:personId/consents. */
export const grantConsentSchema = z.object({
  kind: z.enum(CONSENT_KINDS),
  /** The person themself (adults) or one of their guardians (minors). */
  grantedByPersonId: z.uuid(),
  grantedOn: day,
});
export type GrantConsentInput = z.infer<typeof grantConsentSchema>;

/** Data-subject requests (GDPR arts. 15 to 21) the office answers. */
export const PRIVACY_REQUEST_KINDS = ["export", "erasure", "rectification", "other"] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];

export const PRIVACY_REQUEST_STATUSES = ["open", "done", "rejected"] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Body of POST /api/privacy/requests: about oneself or a ward (admins: anyone). */
export const createPrivacyRequestSchema = z.object({
  personId: z.uuid(),
  kind: z.enum(PRIVACY_REQUEST_KINDS),
  message: optionalText(2000),
});
export type CreatePrivacyRequestInput = z.infer<typeof createPrivacyRequestSchema>;

/** Body of POST /api/privacy/requests/:id/resolve. */
export const resolvePrivacyRequestSchema = z.object({
  status: z.enum(["done", "rejected"]),
  note: optionalText(2000),
});
export type ResolvePrivacyRequestInput = z.infer<typeof resolvePrivacyRequestSchema>;

export const privacyRequestsQuerySchema = z.object({
  status: z.enum(PRIVACY_REQUEST_STATUSES).optional(),
});

/** Body of POST /api/privacy/account/delete (in-app account deletion, App Store rule 5.1.1). */
export const deleteAccountSchema = z.object({
  /** Also ask the club to erase the person record linked to the login. */
  eraseData: z.boolean().default(false),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** Body of POST /api/privacy/people/:personId/erase. */
export const erasePersonSchema = z.object({
  /** The request this erasure answers; it is closed as done. */
  requestId: z.uuid().nullish(),
});

/** Why an erasure was refused (409 `erasure_blocked`, listed in `issues`). */
export const ERASURE_BLOCKERS = [
  "fees", // charges and payments are accounting records the club must keep
  "equipment_loan", // an item is still on loan to the person
] as const;
export type ErasureBlocker = (typeof ERASURE_BLOCKERS)[number];

/** GET /api/audit-log query: newest first, filter by subject person or action. */
export const auditQuerySchema = z.object({
  personId: z.uuid().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * How long the daily retention job keeps data that has no further use (placeholders until
 * the club confirms them; see docs/REQUIREMENTS.md). Prospects follow their own
 * `retainUntil` (ADR 0007).
 */
export const RETENTION = {
  auditLogMonths: 36,
  notificationMonths: 12,
  closedRequestMonths: 36,
  /** Unaccepted invitations, counted from their expiry. */
  expiredInvitationDays: 30,
  /** Self-registered accounts that never verified their email (ADR 0026). */
  unverifiedUserDays: 7,
} as const;
