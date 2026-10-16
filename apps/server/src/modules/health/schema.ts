import { HEALTH_DISCIPLINES, INJURY_AVAILABILITIES, INJURY_STATUSES } from "@rsc/shared";
import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { persons } from "../people/schema.js";

export const healthDiscipline = pgEnum("health_discipline", HEALTH_DISCIPLINES);
export const injuryStatus = pgEnum("injury_status", INJURY_STATUSES);
export const injuryAvailability = pgEnum("injury_availability", INJURY_AVAILABILITIES);

/**
 * Health tier (ADR 0008). Every read goes through `authorizeHealthRead()`; the rows belong
 * to the discipline that wrote them and only that discipline's clinical roles read them.
 */
export const healthNotes = pgTable(
  "health_notes",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    discipline: healthDiscipline().notNull(),
    recordedOn: date({ mode: "string" }).notNull(),
    summary: text().notNull(),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("health_notes_person_idx").on(t.personId, t.discipline)],
);

/** An injury and its return to play. Open injuries drive the derived availability. */
export const injuries = pgTable(
  "injuries",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    discipline: healthDiscipline().notNull(),
    bodyPart: text().notNull(),
    description: text(),
    startedOn: date({ mode: "string" }).notNull(),
    status: injuryStatus().notNull().default("active"),
    availability: injuryAvailability().notNull().default("unavailable"),
    expectedReturnOn: date({ mode: "string" }),
    clearedOn: date({ mode: "string" }),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("injuries_person_idx").on(t.personId),
    check("injuries_cleared", sql`(${t.status} = 'cleared') = (${t.clearedOn} IS NOT NULL)`),
  ],
);

/** Guardian consent for keeping a minor's health records. At most one active per person. */
export const healthConsents = pgTable(
  "health_consents",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    grantedByPersonId: uuid().references(() => persons.id, { onDelete: "set null" }),
    grantedOn: date({ mode: "string" }).notNull(),
    revokedOn: date({ mode: "string" }),
    recordedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("health_consents_one_active_idx").on(t.personId).where(sql`${t.revokedOn} IS NULL`),
    check("health_consents_dates", sql`${t.revokedOn} IS NULL OR ${t.revokedOn} >= ${t.grantedOn}`),
  ],
);

export type HealthNote = typeof healthNotes.$inferSelect;
export type Injury = typeof injuries.$inferSelect;
export type HealthConsent = typeof healthConsents.$inferSelect;
