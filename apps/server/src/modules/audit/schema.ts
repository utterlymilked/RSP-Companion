import { AUDIT_ACTIONS, SENSITIVITY_TIERS } from "@rsc/shared";
import { index, jsonb, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { persons } from "../people/schema.js";

export const auditAction = pgEnum("audit_action", AUDIT_ACTIONS);
export const sensitivityTier = pgEnum("sensitivity_tier", SENSITIVITY_TIERS);

/**
 * Append-only record of sensitive reads and access changes (who, what, about whom, when).
 * The app only inserts. References are kept when possible and nulled when the row they point
 * at is deleted, so erasing a person (M17) leaves no personal data behind here.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: auditAction().notNull(),
    tier: sensitivityTier(),
    subjectPersonId: uuid().references(() => persons.id, { onDelete: "set null" }),
    subjectUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Non-personal context: role granted, health discipline, route. Never field values. */
    details: jsonb().$type<Record<string, string | number | boolean | null>>(),
  },
  (t) => [
    index("audit_log_occurred_at_idx").on(t.occurredAt),
    index("audit_log_subject_person_idx").on(t.subjectPersonId),
    index("audit_log_actor_idx").on(t.actorUserId),
  ],
);

export type AuditEntry = typeof auditLog.$inferSelect;
export type NewAuditEntry = typeof auditLog.$inferInsert;
