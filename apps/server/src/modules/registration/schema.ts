import { bigint, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth/schema.js";

/** Better Auth's rate limiter store (`rateLimit.storage = "database"`), so limits survive restarts. */
export const rateLimits = pgTable("rate_limits", {
  id: uuid().primaryKey().defaultRandom(),
  key: text().notNull().unique("rate_limits_key_key"),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/**
 * Fixed-window counters for registration abuse protection (ADR 0026 section 1). Keys are
 * HMACs of the address, IP or domain, never the raw value; rows older than 14 days are purged.
 */
export const abuseCounters = pgTable("abuse_counters", {
  key: text().primaryKey(),
  count: integer().notNull(),
  windowStart: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Inactivity notices already emailed (ADR 0026 section 9), so each warning goes out once per
 * login and deadline. Cleared when the user signs in again.
 */
export const accountNotices = pgTable(
  "account_notices",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Days before the action the notice announced (30, 7). */
    daysBefore: integer().notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("account_notices_user_days_key").on(t.userId, t.daysBefore)],
);
