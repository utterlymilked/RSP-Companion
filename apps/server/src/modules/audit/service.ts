import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { type AuditEntry, auditLog, type NewAuditEntry } from "./schema.js";

/** Appends an entry to the audit log. Pass only ids and non-personal details. */
export async function audit(db: Db, entry: Omit<NewAuditEntry, "id" | "occurredAt">) {
  await db.insert(auditLog).values(entry);
}

/** Newest entries first, optionally about one person, paged with `before` (an occurredAt). */
export async function listAudit(
  db: Db,
  filter: { subjectPersonId?: string; before?: Date; limit: number },
): Promise<AuditEntry[]> {
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        filter.subjectPersonId ? eq(auditLog.subjectPersonId, filter.subjectPersonId) : undefined,
        filter.before ? lt(auditLog.occurredAt, filter.before) : undefined,
      ),
    )
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
    .limit(filter.limit);
}
