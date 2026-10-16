import type { AttendanceSyncInput, RsvpStatus } from "@rsc/shared";
import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { events } from "../events/schema.js";
import { persons } from "../people/schema.js";
import { teamMembers } from "../teams/schema.js";
import { eventParticipants } from "./schema.js";

/**
 * Calls people up for an event: the given ones, or the team's current roster. People already
 * called up keep their answer and attendance. Returns the ids newly called up, which is what
 * a notification must go to (M15 plugs in at the route; payloads carry ids only, ADR 0004).
 */
export async function callUp(
  db: Db,
  event: { id: string; teamId: string | null },
  personIds: string[] | undefined,
  userId: string,
): Promise<string[]> {
  let ids = personIds;
  if (!ids) {
    if (!event.teamId) return [];
    const roster = await db
      .select({ personId: teamMembers.personId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, event.teamId), isNull(teamMembers.leftOn)));
    ids = roster.map((r) => r.personId);
  }
  if (ids.length === 0) return [];
  const added = await db
    .insert(eventParticipants)
    .values(
      [...new Set(ids)].map((personId) => ({ eventId: event.id, personId, calledUpBy: userId })),
    )
    .onConflictDoNothing()
    .returning({ personId: eventParticipants.personId });
  return added.map((r) => r.personId);
}

/** Removes a call-up. Returns whether there was one. */
export async function removeCallUp(db: Db, eventId: string, personId: string) {
  const rows = await db
    .delete(eventParticipants)
    .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.personId, personId)))
    .returning({ id: eventParticipants.id });
  return rows.length > 0;
}

/** The people called up for an event with their answer and attendance, by name. */
export async function listParticipants(db: Db, eventId: string) {
  return db
    .select({
      personId: eventParticipants.personId,
      name: sql<string>`coalesce(${persons.displayName}, ${persons.fullName})`,
      shirtNumber: teamMembers.shirtNumber,
      rsvp: eventParticipants.rsvp,
      rsvpNote: eventParticipants.rsvpNote,
      attendance: eventParticipants.attendance,
    })
    .from(eventParticipants)
    .innerJoin(persons, eq(persons.id, eventParticipants.personId))
    .innerJoin(events, eq(events.id, eventParticipants.eventId))
    .leftJoin(
      teamMembers,
      and(eq(teamMembers.teamId, events.teamId), eq(teamMembers.personId, persons.id)),
    )
    .where(eq(eventParticipants.eventId, eventId))
    .orderBy(asc(persons.fullName));
}

/** Records the answer of a person to a call-up. Returns false when they were not called up. */
export async function setRsvp(
  db: Db,
  eventId: string,
  personId: string,
  input: { rsvp: RsvpStatus; note: string | null },
  userId: string,
) {
  const rows = await db
    .update(eventParticipants)
    .set({ rsvp: input.rsvp, rsvpNote: input.note, rsvpAt: new Date(), rsvpBy: userId })
    .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.personId, personId)))
    .returning({ id: eventParticipants.id });
  return rows.length > 0;
}

/**
 * Applies attendance marks. Idempotent and order-independent: a mark older than the stored
 * one is ignored, so a device that was offline can replay its whole queue. People not yet
 * called up are added (a coach may take attendance at a training without calling anyone up).
 */
export async function syncAttendance(
  db: Db,
  eventId: string,
  marks: AttendanceSyncInput["marks"],
  userId: string,
) {
  // Several marks for one person in a batch: only the newest counts.
  const latest = new Map<string, (typeof marks)[number]>();
  for (const mark of marks) {
    const seen = latest.get(mark.personId);
    if (!seen || mark.markedAt >= seen.markedAt) latest.set(mark.personId, mark);
  }
  for (const mark of latest.values()) {
    await db
      .insert(eventParticipants)
      .values({
        eventId,
        personId: mark.personId,
        calledUpBy: userId,
        attendance: mark.status,
        attendanceMarkedAt: mark.markedAt,
        attendanceBy: userId,
      })
      .onConflictDoUpdate({
        target: [eventParticipants.eventId, eventParticipants.personId],
        set: {
          attendance: mark.status,
          attendanceMarkedAt: mark.markedAt,
          attendanceBy: userId,
          updatedAt: new Date(),
        },
        setWhere: sql`${eventParticipants.attendanceMarkedAt} IS NULL OR ${eventParticipants.attendanceMarkedAt} <= ${mark.markedAt}`,
      });
  }
}

/** Upcoming and recent call-ups of the given people (themself and their wards). */
export async function listCallUpsFor(db: Db, personIds: string[], since: Date) {
  if (personIds.length === 0) return [];
  return db
    .select({
      eventId: events.id,
      personId: eventParticipants.personId,
      personName: sql<string>`coalesce(${persons.displayName}, ${persons.fullName})`,
      kind: events.kind,
      status: events.status,
      title: events.title,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      location: events.location,
      rsvp: eventParticipants.rsvp,
    })
    .from(eventParticipants)
    .innerJoin(events, eq(events.id, eventParticipants.eventId))
    .innerJoin(persons, eq(persons.id, eventParticipants.personId))
    .where(
      and(
        inArray(eventParticipants.personId, personIds),
        gte(events.endsAt, since),
        ne(events.status, "cancelled"),
      ),
    )
    .orderBy(asc(events.startsAt));
}

/**
 * Attendance of a team's people over a period: sessions called up for, marked present,
 * absent or excused, and the share present among the sessions with a mark. Cancelled events
 * and sessions without any mark do not count.
 */
export async function attendanceStats(db: Db, teamId: string, from: Date, to: Date) {
  const rows = await db
    .select({
      personId: eventParticipants.personId,
      name: sql<string>`coalesce(${persons.displayName}, ${persons.fullName})`,
      called: sql<number>`count(*)::int`,
      present: sql<number>`count(*) filter (where ${eventParticipants.attendance} = 'present')::int`,
      absent: sql<number>`count(*) filter (where ${eventParticipants.attendance} = 'absent')::int`,
      excused: sql<number>`count(*) filter (where ${eventParticipants.attendance} = 'excused')::int`,
    })
    .from(eventParticipants)
    .innerJoin(events, eq(events.id, eventParticipants.eventId))
    .innerJoin(persons, eq(persons.id, eventParticipants.personId))
    .where(
      and(
        eq(events.teamId, teamId),
        ne(events.status, "cancelled"),
        gte(events.startsAt, from),
        lt(events.startsAt, to),
      ),
    )
    .groupBy(eventParticipants.personId, persons.displayName, persons.fullName)
    .orderBy(asc(persons.fullName));
  return rows.map((r) => {
    const marked = r.present + r.absent + r.excused;
    return { ...r, rate: marked === 0 ? null : r.present / marked };
  });
}
