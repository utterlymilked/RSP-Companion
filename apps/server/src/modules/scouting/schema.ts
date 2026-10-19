import {
  type ArchetypeKey,
  GUARDIAN_RELATIONS,
  PROSPECT_CONTEXTS,
  PROSPECT_ESCALOES,
  PROSPECT_ID_TYPES,
  PROSPECT_STATUSES,
  type Scores,
} from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { persons } from "../people/schema.js";

export const prospectStatus = pgEnum("prospect_status", PROSPECT_STATUSES);
export const prospectEscalao = pgEnum("prospect_escalao", PROSPECT_ESCALOES);
export const prospectContext = pgEnum("prospect_context", PROSPECT_CONTEXTS);
export const guardianRelation = pgEnum("guardian_relation", GUARDIAN_RELATIONS);
export const prospectIdType = pgEnum("prospect_id_type", PROSPECT_ID_TYPES);

/**
 * An external player being scouted. Deliberately not a `persons` row: prospects are not
 * members, and their data has its own retention (`retainUntil`, ADR 0007). On signing, the
 * club registers the player in the people registry.
 */
export const prospects = pgTable(
  "prospects",
  {
    id: id(),
    fullName: text().notNull(),
    birthYear: integer(),
    currentClub: text(),
    position: text(),
    status: prospectStatus().notNull().default("identified"),
    notes: text(),
    birthDate: date({ mode: "string" }),
    guardianName: text(),
    guardianPhone: text(),
    guardianEmail: text(),
    guardianRelation: guardianRelation(),
    ownContact: text(),
    socialUrl: text(),
    targetEscalao: prospectEscalao(),
    context: prospectContext(),
    positions: text().array().notNull().default(sql`'{}'::text[]`),
    heightCm: integer(),
    seasonsPlayed: integer(),
    motive: text(),
    goal: text(),
    idType: prospectIdType(),
    nationality: text(),
    birthplace: text(),
    postalCode: text(),
    area: text(),
    preferredDate: date({ mode: "string" }),
    alternativeDate: date({ mode: "string" }),
    trialDate: date({ mode: "string" }),
    trialVenue: text(),
    clubAuthorisationNeeded: boolean().notNull().default(false),
    clubAuthorised: boolean().notNull().default(false),
    retainUntil: date({ mode: "string" }).notNull(),
    /** NIF given for the prospect; personal-tier, kept under the prospect's retention. */
    nif: text(),
    /** The club member this prospect is, once known (by NIF or chosen by hand). */
    personId: uuid().references(() => persons.id, { onDelete: "set null" }),
    /** Archetype chosen by hand; null means use the computed one. */
    archetype: text().$type<ArchetypeKey>(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("prospects_status_idx").on(t.status),
    index("prospects_person_idx").on(t.personId),
    index("prospects_nif_idx").on(t.nif),
  ],
);

export const prospectReports = pgTable(
  "prospect_reports",
  {
    id: id(),
    prospectId: uuid()
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    observedOn: date({ mode: "string" }).notNull(),
    rating: integer().notNull(),
    text: text().notNull(),
    /** Attribute ratings 1-10 by key (see ATTRIBUTES in @rsc/shared). */
    scores: jsonb().$type<Scores>().notNull().default({}),
    /** Position played in the match observed. */
    positionPlayed: text(),
    /** Zone intensities 0-3, 6x3 row-major; null when not recorded. */
    heat: jsonb().$type<number[]>(),
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("prospect_reports_prospect_idx").on(t.prospectId, t.observedOn),
    check("prospect_reports_rating_check", sql`${t.rating} between 1 and 5`),
  ],
);

export type Prospect = typeof prospects.$inferSelect;
export type ProspectReport = typeof prospectReports.$inferSelect;
