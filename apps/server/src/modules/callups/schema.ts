import { ATTENDANCE_STATUSES, RSVP_STATUSES } from "@rsc/shared";
import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { athletes } from "../athletes/schema.js";
import { users } from "../auth/schema.js";
import { events } from "../events/schema.js";
import { persons } from "../people/schema.js";

export const rsvpStatus = pgEnum("rsvp_status", RSVP_STATUSES);
export const attendanceStatus = pgEnum("attendance_status", ATTENDANCE_STATUSES);

/**
 * A person called up for an event (convocatória), with their answer and the attendance the
 * coach recorded. Attendance marks keep the device time they were taken at, so a queue
 * replayed after being offline never overwrites a newer mark. General tier: no health data.
 */
export const eventParticipants = pgTable(
  "event_participants",
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    /** The sporting subject (ADR 0024); filled from `personId` by a trigger until step 5. */
    athleteId: uuid()
      .notNull()
      // Sent as NULL so the BEFORE trigger fills it from person_id; drop with step 5.
      .$defaultFn(() => null as unknown as string)
      .references(() => athletes.id, { onDelete: "cascade" }),
    calledUpAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    calledUpBy: uuid().references(() => users.id, { onDelete: "set null" }),
    rsvp: rsvpStatus().notNull().default("pending"),
    rsvpNote: text(),
    rsvpAt: timestamp({ withTimezone: true }),
    rsvpBy: uuid().references(() => users.id, { onDelete: "set null" }),
    attendance: attendanceStatus(),
    attendanceMarkedAt: timestamp({ withTimezone: true }),
    attendanceBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("event_participants_event_person_key").on(t.eventId, t.personId),
    index("event_participants_person_idx").on(t.personId),
    index("event_participants_athlete_idx").on(t.athleteId),
  ],
);

export type EventParticipant = typeof eventParticipants.$inferSelect;
