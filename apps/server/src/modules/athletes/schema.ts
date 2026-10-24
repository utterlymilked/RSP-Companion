import type {
  AthleteAttributeType,
  AttributeSource,
  DatePrecision,
  RecordSource,
  RecordStatus,
} from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { clubs } from "../clubs/schema.js";
import { contacts, persons } from "../people/schema.js";

/**
 * An athlete: the sporting subject, scouted or the club's own (ADR 0024). Independent of
 * persons and users; `personId` is the optional link. Everything else about the athlete
 * (name, birth date, height, ...) is an attribute with history. `displayName` is the best
 * current name or nickname, kept in sync by the service so a name always exists.
 */
export const athletes = pgTable(
  "athletes",
  {
    id: id(),
    /** Human handle for lists and bug reports, like `persons.identity_code`. */
    code: text()
      .notNull()
      .default(sql`'ATL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))`),
    displayName: text().notNull(),
    personId: uuid().references(() => persons.id, { onDelete: "set null" }),
    source: text().$type<RecordSource>().notNull().default("manual"),
    status: text().$type<RecordStatus>().notNull().default("active"),
    retainUntil: date({ mode: "string" }),
    mergedIntoId: uuid(),
    deletedAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("athletes_code_key").on(t.code),
    uniqueIndex("athletes_person_key").on(t.personId).where(sql`${t.personId} is not null`),
    check(
      "athletes_display_name",
      sql`char_length(btrim(${t.displayName})) between 2 and 160 and ${t.displayName} !~ '^[ .''’-]*$'`,
    ),
  ],
);

/**
 * One value of one attribute type for an athlete. Append-only: a change closes the current
 * row (`valid_to`) and inserts a new one, so the table is its own history.
 */
export const athleteAttributes = pgTable(
  "athlete_attributes",
  {
    id: id(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    type: text().$type<AthleteAttributeType>().notNull(),
    valueText: text(),
    valueNum: numeric({ mode: "number" }),
    valueDate: date({ mode: "string" }),
    /** For dates: `year` means only the year is known (value is that year's 1 January). */
    precision: text().$type<DatePrecision>(),
    source: text().$type<AttributeSource>().notNull().default("observed"),
    validFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp({ withTimezone: true }),
    recordedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("athlete_attributes_athlete_idx").on(t.athleteId, t.type),
    check(
      "athlete_attributes_one_value",
      sql`(${t.valueText} is not null)::int + (${t.valueNum} is not null)::int + (${t.valueDate} is not null)::int = 1`,
    ),
    // One current value per single-valued type; positions may be several.
    uniqueIndex("athlete_attributes_current_single_idx")
      .on(t.athleteId, t.type)
      .where(sql`${t.validTo} is null and ${t.type} <> 'position'`),
    uniqueIndex("athlete_attributes_current_position_idx")
      .on(t.athleteId, t.valueText)
      .where(sql`${t.validTo} is null and ${t.type} = 'position'`),
  ],
);

/** Clubs the athlete played for, none to many. `clubName` covers clubs not in `clubs`. */
export const athleteClubs = pgTable(
  "athlete_clubs",
  {
    id: id(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    clubId: uuid().references(() => clubs.id, { onDelete: "set null" }),
    clubName: text(),
    fromDate: date({ mode: "string" }),
    toDate: date({ mode: "string" }),
    level: text(),
    isLoan: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("athlete_clubs_athlete_idx").on(t.athleteId),
    check("athlete_clubs_has_club", sql`${t.clubId} is not null or ${t.clubName} is not null`),
  ],
);

/** Legal basis and information given about an athlete's data. Optional, never blocks scouting. */
export const athleteConsents = pgTable(
  "athlete_consents",
  {
    id: id(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    /** `consent`, `legitimate_interest` or `contract`. */
    basis: text().notNull(),
    noticeVersion: text(),
    /** Free description of who gave it (athlete, guardian name); no contact data. */
    givenBy: text(),
    givenAt: timestamp({ withTimezone: true }),
    informedAt: timestamp({ withTimezone: true }),
    scope: text(),
    withdrawnAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("athlete_consents_athlete_idx").on(t.athleteId)],
);

/** Which athlete uses which contact (their own, or a guardian's), and when. */
export const athleteContactLinks = pgTable(
  "athlete_contact_links",
  {
    id: id(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    /** `own`, `guardian`, `other`. */
    label: text().notNull().default("own"),
    isPrimary: boolean().notNull().default(false),
    validFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("athlete_contact_links_athlete_idx").on(t.athleteId),
    unique("athlete_contact_links_athlete_contact_key").on(t.athleteId, t.contactId),
  ],
);

export type Athlete = typeof athletes.$inferSelect;
export type AthleteAttribute = typeof athleteAttributes.$inferSelect;
