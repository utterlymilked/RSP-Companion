import { APPROVAL_STATUSES, APPROVAL_TYPES } from "@rsc/shared";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";

export const approvalType = pgEnum("approval_type", APPROVAL_TYPES);
export const approvalStatus = pgEnum("approval_status", APPROVAL_STATUSES);

/**
 * A request waiting for a human decision (ADR 0026). `payload` holds references (ids) to what
 * the type needs, never document images or other evidence; the type's own tables keep those.
 */
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    type: approvalType().notNull(),
    status: approvalStatus().notNull().default("pending"),
    subjectUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb().$type<Record<string, string>>().notNull().default({}),
    reviewerUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    reason: text(),
    decidedAt: timestamp({ withTimezone: true }),
    /** When reviewers were last reminded that this is waiting. */
    remindedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("approval_requests_status_created_idx").on(t.status, t.createdAt)],
);

export type ApprovalRow = typeof approvalRequests.$inferSelect;
