import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";

/**
 * Encrypted identity-evidence files (ADR 0026 section 10). The bytes live in the private
 * bucket prefix as ciphertext; this row holds what is needed to read them (wrapped data key,
 * master key id) and a plaintext hash for duplicate detection. Rows and files are purged when
 * the request they belong to is decided, withdrawn or expires.
 */
export const evidenceFiles = pgTable(
  "evidence_files",
  {
    id: id(),
    ownerUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    storageKey: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    keyId: text().notNull(),
    wrappedKey: text().notNull(),
    sha256: text().notNull(),
    /** After this the purge job deletes the file even if nobody decided (pending expiry). */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("evidence_files_sha256_idx").on(t.sha256),
    index("evidence_files_expires_idx").on(t.expiresAt),
  ],
);

export type EvidenceFile = typeof evidenceFiles.$inferSelect;
