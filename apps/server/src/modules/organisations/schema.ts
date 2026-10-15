import { ORGANISATION_KINDS } from "@rsp/shared";
import { boolean, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";

export const organisationKind = pgEnum("organisation_kind", ORGANISATION_KINDS);

/** The club and the entities it shares people and spaces with (SAD, Escola, partners). */
export const organisations = pgTable("organisations", {
  id: id(),
  name: text().notNull().unique(),
  shortName: text(),
  kind: organisationKind().notNull(),
  ...timestamps,
});

/** A gabinete / department of an organisation (nutrição, scouting, direção EF, …). */
export const departments = pgTable(
  "departments",
  {
    id: id(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    name: text().notNull(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [unique("departments_organisation_name_key").on(t.organisationId, t.name)],
);

export type Organisation = typeof organisations.$inferSelect;
export type NewOrganisation = typeof organisations.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
