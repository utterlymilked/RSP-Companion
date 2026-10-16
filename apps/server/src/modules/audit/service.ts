import type { AuditAction } from "@rsc/shared";
import { and, desc, eq, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/index.js";
import { users } from "../auth/schema.js";
import { persons } from "../people/schema.js";
import { auditLog, type NewAuditEntry } from "./schema.js";

const actors = alias(users, "actors");
const subjectUsers = alias(users, "subject_users");

/** Appends an entry to the audit log. Pass only ids and non-personal details. */
export async function audit(db: Db, entry: Omit<NewAuditEntry, "id" | "occurredAt">) {
  await db.insert(auditLog).values(entry);
}

/**
 * Newest entries first, optionally about one person or of one action, paged with `before`
 * (an occurredAt). Names are read at request time, so an erased person or deleted user
 * shows as null.
 */
export async function listAudit(
  db: Db,
  filter: { subjectPersonId?: string; action?: AuditAction; before?: Date; limit: number },
) {
  return db
    .select({
      id: auditLog.id,
      occurredAt: auditLog.occurredAt,
      action: auditLog.action,
      tier: auditLog.tier,
      actorUserId: auditLog.actorUserId,
      actorName: actors.name,
      subjectPersonId: auditLog.subjectPersonId,
      subjectPersonName: persons.fullName,
      subjectUserId: auditLog.subjectUserId,
      subjectUserName: subjectUsers.name,
      details: auditLog.details,
    })
    .from(auditLog)
    .leftJoin(actors, eq(actors.id, auditLog.actorUserId))
    .leftJoin(persons, eq(persons.id, auditLog.subjectPersonId))
    .leftJoin(subjectUsers, eq(subjectUsers.id, auditLog.subjectUserId))
    .where(
      and(
        filter.subjectPersonId ? eq(auditLog.subjectPersonId, filter.subjectPersonId) : undefined,
        filter.action ? eq(auditLog.action, filter.action) : undefined,
        filter.before ? lt(auditLog.occurredAt, filter.before) : undefined,
      ),
    )
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
    .limit(filter.limit);
}
