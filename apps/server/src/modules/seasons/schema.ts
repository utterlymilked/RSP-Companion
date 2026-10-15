import { CATEGORIES } from "@rsp/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";

export const category = pgEnum("category", CATEGORIES);

/** A sporting season, e.g. "2026/27". Classes, teams and staff assignments are per season. */
export const seasons = pgTable(
  "seasons",
  {
    id: id(),
    name: text().notNull().unique(),
    startsOn: date({ mode: "string" }).notNull(),
    endsOn: date({ mode: "string" }).notNull(),
    /** Exactly one season at most is current (partial unique index below). */
    isCurrent: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("seasons_one_current_idx").on(t.isCurrent).where(sql`${t.isCurrent}`),
    check("seasons_dates", sql`${t.endsOn} > ${t.startsOn}`),
  ],
);

/**
 * Escalão: an age group in a season, defined by an inclusive range of birth years
 * (e.g. Sub-10 in 2026/27 = born 2017). Defined per season because the years shift.
 */
export const ageGroups = pgTable(
  "age_groups",
  {
    id: id(),
    seasonId: uuid()
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    name: text().notNull(),
    category: category().notNull(),
    birthYearFrom: smallint().notNull(),
    birthYearTo: smallint().notNull(),
    sortOrder: smallint().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("age_groups_season_name_category_key").on(t.seasonId, t.name, t.category),
    check("age_groups_years", sql`${t.birthYearFrom} <= ${t.birthYearTo}`),
  ],
);

export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type AgeGroup = typeof ageGroups.$inferSelect;
export type NewAgeGroup = typeof ageGroups.$inferInsert;
