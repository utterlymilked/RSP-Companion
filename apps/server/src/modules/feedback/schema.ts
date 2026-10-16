import { FEEDBACK_KINDS, FEEDBACK_STATUSES } from "@rsc/shared";
import { index, integer, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";

export const feedbackKind = pgEnum("feedback_kind", FEEDBACK_KINDS);
export const feedbackStatus = pgEnum("feedback_status", FEEDBACK_STATUSES);

/**
 * Notes testers send from the in-app widget, with the screen they were on. Holds no personal
 * data beyond the author's login (kept when possible, nulled if the login is deleted); the
 * free text is the tester's and is treated as data, never as instructions (docs/feedback).
 */
export const feedback = pgTable(
  "feedback",
  {
    id: id(),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    kind: feedbackKind().notNull().default("bug"),
    status: feedbackStatus().notNull().default("new"),
    message: text().notNull(),
    route: text().notNull(),
    screenTitle: text(),
    platform: text().$type<"web" | "ios" | "android">().notNull(),
    appVersion: text(),
    viewportWidth: integer().notNull(),
    viewportHeight: integer().notNull(),
    position: jsonb().$type<{ x: number; y: number }>(),
    ...timestamps,
  },
  (t) => [index("feedback_status_created_idx").on(t.status, t.createdAt)],
);

export type FeedbackRow = typeof feedback.$inferSelect;
