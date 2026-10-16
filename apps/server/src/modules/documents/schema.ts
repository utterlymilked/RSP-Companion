import { DOCUMENT_KINDS } from "@rsc/shared";
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { persons } from "../people/schema.js";

export const documentKind = pgEnum("document_kind", DOCUMENT_KINDS);

/**
 * A file kept for a person (ADR 0009): medical exam, federation registration, ID. The bytes
 * live in file storage under `storageKey`; this row holds what the app needs to list them and
 * to track expiry. The kind decides who may open the file (`medical_exam` is health tier).
 */
export const documents = pgTable(
  "documents",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    kind: documentKind().notNull(),
    title: text(),
    issuedOn: date({ mode: "string" }),
    expiresOn: date({ mode: "string" }),
    storageKey: text().notNull().unique("documents_storage_key_key"),
    fileName: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    uploadedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("documents_person_idx").on(t.personId),
    index("documents_expires_on_idx").on(t.expiresOn),
    check(
      "documents_dates",
      sql`${t.issuedOn} IS NULL OR ${t.expiresOn} IS NULL OR ${t.expiresOn} >= ${t.issuedOn}`,
    ),
    check("documents_size", sql`${t.sizeBytes} > 0`),
  ],
);

export type Document = typeof documents.$inferSelect;
