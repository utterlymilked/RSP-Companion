import { CONSENT_KINDS, PRIVACY_REQUEST_KINDS, PRIVACY_REQUEST_STATUSES } from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { persons } from "../people/schema.js";

export const consentKind = pgEnum("consent_kind", CONSENT_KINDS);
export const privacyRequestKind = pgEnum("privacy_request_kind", PRIVACY_REQUEST_KINDS);
export const privacyRequestStatus = pgEnum("privacy_request_status", PRIVACY_REQUEST_STATUSES);

/**
 * A consent of one kind (image rights, transport): who gave it and when, and when it was
 * withdrawn. History is kept; at most one active row per person and kind. Health consent
 * has its own table (ADR 0008). General tier: whether a person may appear in photos is what
 * coaches need to know.
 */
export const consents = pgTable(
  "consents",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    kind: consentKind().notNull(),
    grantedByPersonId: uuid().references(() => persons.id, { onDelete: "set null" }),
    grantedOn: date({ mode: "string" }).notNull(),
    revokedOn: date({ mode: "string" }),
    recordedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("consents_one_active_idx")
      .on(t.personId, t.kind)
      .where(sql`${t.revokedOn} IS NULL`),
    check("consents_dates", sql`${t.revokedOn} IS NULL OR ${t.revokedOn} >= ${t.grantedOn}`),
  ],
);

/**
 * A data-subject request (copy, erasure, rectification) and how the office answered it.
 * The person reference is nulled when the person is erased, so the request stays as a
 * record that it was handled without naming anyone.
 */
export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: id(),
    personId: uuid().references(() => persons.id, { onDelete: "set null" }),
    kind: privacyRequestKind().notNull(),
    status: privacyRequestStatus().notNull().default("open"),
    message: text(),
    requestedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp({ withTimezone: true }),
    resolvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resolutionNote: text(),
    ...timestamps,
  },
  (t) => [
    index("privacy_requests_status_idx").on(t.status, t.createdAt),
    check("privacy_requests_resolved", sql`(${t.status} = 'open') = (${t.resolvedAt} IS NULL)`),
  ],
);

export type Consent = typeof consents.$inferSelect;
export type PrivacyRequest = typeof privacyRequests.$inferSelect;
