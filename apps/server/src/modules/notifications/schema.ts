import { NOTIFICATION_KINDS, PUSH_PLATFORMS } from "@rsc/shared";
import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { teams } from "../teams/schema.js";

export const notificationKind = pgEnum("notification_kind", NOTIFICATION_KINDS);
export const pushPlatform = pgEnum("push_platform", PUSH_PLATFORMS);

/** A club or team announcement (ADR 0010). `teamId` null addresses the whole club. */
export const announcements = pgTable(
  "announcements",
  {
    id: id(),
    teamId: uuid().references(() => teams.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("announcements_created_at_idx").on(t.createdAt)],
);

/**
 * One inbox entry of one user. Holds general-tier text only: an announcement, or a generic
 * line that points at a screen (`link`) where the real data sits behind the usual checks.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKind().notNull(),
    title: text().notNull(),
    body: text(),
    /** In-app path to open, e.g. `/event/<id>`. */
    link: text(),
    announcementId: uuid().references(() => announcements.id, { onDelete: "cascade" }),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

/** A phone that receives push for a user. A token belongs to one user at a time. */
export const pushDevices = pgTable(
  "push_devices",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique("push_devices_token_key"),
    platform: pushPlatform().notNull(),
    ...timestamps,
  },
  (t) => [index("push_devices_user_idx").on(t.userId)],
);

/** Channel choices of a user; no row means the defaults. */
export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  push: boolean().notNull().default(true),
  email: boolean().notNull().default(false),
  ...timestamps,
});
