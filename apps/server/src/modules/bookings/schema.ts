import { BOOKING_ACTIVITIES, BOOKING_STATUSES, SPACE_KINDS, VENUE_KINDS } from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { departments } from "../organisations/schema.js";
import { teams } from "../teams/schema.js";

export const venueKind = pgEnum("venue_kind", VENUE_KINDS);
export const spaceKind = pgEnum("space_kind", SPACE_KINDS);
export const bookingActivity = pgEnum("booking_activity", BOOKING_ACTIVITIES);
export const bookingStatus = pgEnum("booking_status", BOOKING_STATUSES);

/** A place: the home complex or an external ground from the away-venues list. */
export const venues = pgTable("venues", {
  id: id(),
  name: text().notNull().unique(),
  kind: venueKind().notNull(),
  address: text(),
  ...timestamps,
});

/** Something bookable at a venue: campo 1, auditório, sala de reuniões 1, gabinete DEF, … */
export const spaces = pgTable(
  "spaces",
  {
    id: id(),
    venueId: uuid()
      .notNull()
      .references(() => venues.id, { onDelete: "restrict" }),
    name: text().notNull(),
    kind: spaceKind().notNull(),
    capacity: integer(),
    /**
     * Ways a whole pitch can also be booked in parts, e.g. {2,3} = halves and thirds. The
     * parts are spaces of their own (see `parentId`), created and kept by the service.
     */
    divisions: smallint().array().notNull().default(sql`'{}'::smallint[]`),
    /** Set on a part: the whole pitch it belongs to, which part, and out of how many. */
    parentId: uuid().references((): AnyPgColumn => spaces.id, { onDelete: "restrict" }),
    partCount: smallint(),
    partIndex: smallint(),
    /** Inactive spaces keep their history but cannot be booked. */
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("spaces_venue_name_key").on(t.venueId, t.name),
    check("spaces_capacity_positive", sql`${t.capacity} IS NULL OR ${t.capacity} > 0`),
    unique("spaces_part_key").on(t.parentId, t.partCount, t.partIndex),
    check(
      "spaces_part_shape",
      sql`(${t.parentId} IS NULL AND ${t.partCount} IS NULL AND ${t.partIndex} IS NULL)
        OR (${t.parentId} IS NOT NULL AND ${t.partCount} BETWEEN 2 AND 4
          AND ${t.partIndex} BETWEEN 1 AND ${t.partCount}
          AND ${t.divisions} = '{}'::smallint[])`,
    ),
  ],
);

/**
 * A combined space is made of others: "Campo 2+3" has components campo 2 and campo 3.
 * Booking it occupies the components too, and the other way round. One level only.
 */
export const spaceComponents = pgTable(
  "space_components",
  {
    spaceId: uuid()
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    componentId: uuid()
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.componentId] }),
    check("space_components_distinct", sql`${t.spaceId} <> ${t.componentId}`),
  ],
);

/** Groups the occurrences of a recurring booking. */
export const bookingSeries = pgTable("booking_series", {
  id: id(),
  everyWeeks: smallint().notNull(),
  untilOn: date({ mode: "string" }).notNull(),
  ...timestamps,
});

/**
 * One use of a space in a time range by a department. Times are timestamptz (UTC), shown in
 * Europe/Lisbon. Only blocking statuses (shared `isBlockingStatus`) take part in conflict
 * detection; the service checks it under an advisory lock (see service.ts).
 */
export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    spaceId: uuid()
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    departmentId: uuid()
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    /** Set when a team books (coaches and delegados may only book for their own team). */
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    seriesId: uuid().references(() => bookingSeries.id, { onDelete: "set null" }),
    activity: bookingActivity().notNull(),
    status: bookingStatus().notNull().default("to_confirm"),
    title: text(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    targetGroup: text(),
    expectedAttendance: integer(),
    actualAttendance: integer(),
    notes: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("bookings_space_starts_idx").on(t.spaceId, t.startsAt),
    index("bookings_starts_idx").on(t.startsAt),
    index("bookings_series_idx").on(t.seriesId),
    check("bookings_ends_after_start", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "bookings_attendance_non_negative",
      sql`(${t.expectedAttendance} IS NULL OR ${t.expectedAttendance} >= 0)
        AND (${t.actualAttendance} IS NULL OR ${t.actualAttendance} >= 0)`,
    ),
  ],
);

/**
 * Secret link for calendar apps (iCal subscription). One per user; the link works only while
 * the user still holds `bookings.read`. Rotating it replaces the token.
 */
export const calendarFeeds = pgTable("calendar_feeds", {
  id: id(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  ...timestamps,
});

export type Venue = typeof venues.$inferSelect;
export type Space = typeof spaces.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
