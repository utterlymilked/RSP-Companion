import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "../../db/columns.js";

/** Club-wide settings an admin can change without a deploy: one JSON value per key. */
export const clubSettings = pgTable("club_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  ...timestamps,
});
