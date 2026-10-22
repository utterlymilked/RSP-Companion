import { pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";

/**
 * Football clubs offered when picking where a player plays: the public Wikidata list of
 * Portuguese clubs (imported on request) plus clubs typed in by hand. Public facts about
 * organisations, not personal data.
 */
export const clubs = pgTable("clubs", {
  id: id(),
  name: text().notNull(),
  /** Lower-case, accent-free name; one club per key. */
  nameKey: text().notNull().unique("clubs_name_key"),
  city: text(),
  /** `wikidata` or `manual`. */
  source: text().notNull().default("manual"),
  wikidataId: text().unique("clubs_wikidata_key"),
  ...timestamps,
});

export type Club = typeof clubs.$inferSelect;
