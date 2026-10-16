import { RIDE_KINDS } from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { events } from "../events/schema.js";
import { persons } from "../people/schema.js";

export const rideKind = pgEnum("ride_kind", RIDE_KINDS);

/**
 * A club van or a carpool offer for one event. The driver's contact is read from the person
 * record when shown, so it is never copied here. General tier: no health data.
 */
export const transportRides = pgTable(
  "transport_rides",
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: rideKind().notNull(),
    label: text(),
    driverPersonId: uuid().references(() => persons.id, { onDelete: "set null" }),
    seats: integer().notNull(),
    pickupPoint: text(),
    pickupAt: timestamp({ withTimezone: true }),
    notes: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    check("transport_rides_seats_positive", sql`${t.seats} > 0`),
    index("transport_rides_event_idx").on(t.eventId),
  ],
);

/** Seat of a person in a ride; a person rides in at most one vehicle per event. */
export const transportPassengers = pgTable(
  "transport_passengers",
  {
    id: id(),
    rideId: uuid()
      .notNull()
      .references(() => transportRides.id, { onDelete: "cascade" }),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    assignedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("transport_passengers_event_person_key").on(t.eventId, t.personId),
    index("transport_passengers_ride_idx").on(t.rideId),
  ],
);

export type TransportRide = typeof transportRides.$inferSelect;
