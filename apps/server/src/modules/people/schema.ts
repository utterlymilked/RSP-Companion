import { GUARDIAN_RELATIONSHIPS, MEMBERSHIP_STATUSES, SEXES } from "@rsp/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { organisations } from "../organisations/schema.js";

export const sex = pgEnum("sex", SEXES);
export const guardianRelationship = pgEnum("guardian_relationship", GUARDIAN_RELATIONSHIPS);
export const membershipStatus = pgEnum("membership_status", MEMBERSHIP_STATUSES);

/**
 * Any human the club deals with: athlete, guardian, coach, staff, member. Needs no login.
 * Every column has a sensitivity tier in PERSON_FIELD_TIERS (@rsp/shared). There is no
 * free-text notes column on purpose: health data must never end up here (see ADR 0002).
 */
export const persons = pgTable(
  "persons",
  {
    id: id(),
    fullName: text().notNull(),
    /** Short or sporting name shown in lists ("nome desportivo"). */
    displayName: text(),
    sex: sex(),
    birthDate: date({ mode: "string" }),
    email: text(),
    phone: text(),
    /** Federation (FPF/AFL) licence number. */
    federationId: text().unique(),
    ...timestamps,
  },
  (t) => [index("persons_full_name_idx").on(t.fullName)],
);

/** Guardian (encarregado de educação, parent, …) of a minor. Both sides are persons. */
export const guardianships = pgTable(
  "guardianships",
  {
    id: id(),
    guardianId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    childId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    relationship: guardianRelationship().notNull(),
    /** The encarregado de educação: main contact and the one who gives consent (M17). */
    isPrimary: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique("guardianships_guardian_child_key").on(t.guardianId, t.childId),
    index("guardianships_child_idx").on(t.childId),
    uniqueIndex("guardianships_one_primary_idx").on(t.childId).where(sql`${t.isPrimary}`),
    check("guardianships_not_self", sql`${t.guardianId} <> ${t.childId}`),
  ],
);

/** Club membership (sócio) of a person in an organisation, with its member number. */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    memberNumber: text().notNull(),
    status: membershipStatus().notNull().default("active"),
    startedOn: date({ mode: "string" }).notNull(),
    endedOn: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    unique("memberships_organisation_number_key").on(t.organisationId, t.memberNumber),
    uniqueIndex("memberships_one_open_per_person_idx")
      .on(t.personId, t.organisationId)
      .where(sql`${t.status} <> 'ended'`),
    check("memberships_dates", sql`${t.endedOn} IS NULL OR ${t.endedOn} >= ${t.startedOn}`),
  ],
);

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
export type Guardianship = typeof guardianships.$inferSelect;
export type NewGuardianship = typeof guardianships.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
