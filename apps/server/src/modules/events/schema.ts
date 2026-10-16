import { EVENT_KINDS, EVENT_STATUSES, HOME_AWAY, MATCH_FORMATS, MATCH_TYPES } from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { bookings, venues } from "../bookings/schema.js";
import { teams } from "../teams/schema.js";

export const eventKind = pgEnum("event_kind", EVENT_KINDS);
export const eventStatus = pgEnum("event_status", EVENT_STATUSES);
export const matchType = pgEnum("match_type", MATCH_TYPES);
export const matchFormat = pgEnum("match_format", MATCH_FORMATS);
export const homeAway = pgEnum("home_away", HOME_AWAY);

/** Groups the sessions of a recurring training. */
export const eventSeries = pgTable("event_series", {
  id: id(),
  everyWeeks: smallint().notNull(),
  untilOn: date({ mode: "string" }).notNull(),
  ...timestamps,
});

/**
 * An entry of the club calendar: a training, a match or a club event. When it uses a space
 * of the home complex it points at a booking (M6), which holds the reservation and is kept
 * in step with the event's time and status. Away matches name an external venue or a
 * free-text location instead. Times are timestamptz (UTC), shown in Europe/Lisbon.
 */
export const events = pgTable(
  "events",
  {
    id: id(),
    kind: eventKind().notNull(),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    seriesId: uuid().references(() => eventSeries.id, { onDelete: "set null" }),
    bookingId: uuid()
      .unique("events_booking_key")
      .references(() => bookings.id, { onDelete: "set null" }),
    venueId: uuid().references(() => venues.id, { onDelete: "restrict" }),
    status: eventStatus().notNull().default("scheduled"),
    title: text(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    location: text(),
    notes: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("events_starts_idx").on(t.startsAt),
    index("events_team_starts_idx").on(t.teamId, t.startsAt),
    index("events_series_idx").on(t.seriesId),
    check("events_ends_after_start", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/** What only a match has. One row per match event. */
export const eventMatches = pgTable("event_matches", {
  eventId: uuid()
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  matchType: matchType().notNull(),
  competition: text(),
  round: text(),
  format: matchFormat(),
  opponent: text().notNull(),
  homeAway: homeAway().notNull(),
  kit: text(),
  transport: text(),
  medicalCover: text(),
});

export type Event = typeof events.$inferSelect;
