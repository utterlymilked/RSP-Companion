import { bigint, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
