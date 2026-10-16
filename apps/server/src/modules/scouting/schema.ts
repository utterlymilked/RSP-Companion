import { PROSPECT_STATUSES } from "@rsc/shared";
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";

export const prospectStatus = pgEnum("prospect_status", PROSPECT_STATUSES);

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
    retainUntil: date({ mode: "string" }).notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("prospects_status_idx").on(t.status)],
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
