import type {
  BookingActivity,
  BookingStatus,
  CreateEventInput,
  EventKind,
  EventStatus,
  UpdateEventInput,
} from "@rsc/shared";
import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import { bookings, spaces, venues } from "../bookings/schema.js";
import { createBookings, occurrences, updateBooking } from "../bookings/service.js";
import { teams } from "../teams/schema.js";
import { eventMatches, eventSeries, events } from "./schema.js";

const BOOKING_ACTIVITY: Record<EventKind, BookingActivity> = {
  training: "training",
  match: "match",
  club_event: "other",
};

/**
 * Status of the booking behind an event. A team-limited user can only ever *request* a
 * space, so re-scheduling an event puts the booking back to `to_confirm` for them.
 */
function bookingStatusFor(status: EventStatus, requestOnly: boolean): BookingStatus {
  switch (status) {
    case "cancelled":
      return "cancelled";
    case "postponed":
      return "postponed";
    case "played":
      return "done";
    case "scheduled":
      return requestOnly ? "to_confirm" : "confirmed";
  }
}

/**
 * Creates one event, or one per week for a recurring training. With a space, the matching
 * bookings are created first (conflict-checked, all or nothing, see bookings/service.ts) and
 * linked. `requestOnly` makes the bookings requests the club office confirms. Must run in a
 * transaction.
 */
export async function createEvents(
  db: Db,
  input: CreateEventInput,
  ctx: { createdBy: string | null; requestOnly: boolean },
) {
  const { repeat, match, spaceId, departmentId, startsAt, endsAt, ...fields } = input;
  const times = occurrences({ startsAt, endsAt }, repeat);
  const reserved =
    spaceId && departmentId
      ? await createBookings(
          db,
          {
            spaceId,
            departmentId,
            teamId: fields.teamId,
            activity: BOOKING_ACTIVITY[fields.kind],
            title: fields.title,
            targetGroup: null,
            expectedAttendance: null,
            notes: fields.notes,
            startsAt,
            endsAt,
            status: ctx.requestOnly ? "to_confirm" : "confirmed",
            repeat,
          },
          ctx.createdBy,
        )
      : [];
  let seriesId: string | null = null;
  if (repeat && times.length > 1) {
    const [series] = await db
      .insert(eventSeries)
      .values({ everyWeeks: repeat.everyWeeks, untilOn: repeat.until })
      .returning();
    seriesId = series?.id ?? null;
  }
  const created = await db
    .insert(events)
    .values(
      times.map((time, i) => ({
        ...fields,
        ...time,
        seriesId,
        bookingId: reserved[i]?.id ?? null,
        createdBy: ctx.createdBy,
      })),
    )
    .returning();
  if (match) {
    await db.insert(eventMatches).values(created.map((e) => ({ eventId: e.id, ...match })));
  }
  return created;
}

/**
 * Changes an event. Time and status changes are passed on to its booking, which re-checks
 * conflicts. `allow.teamIds` limits team-limited users to events of their own teams.
 * Returns null when the event does not exist. Must run in a transaction.
 */
export async function updateEvent(
  db: Db,
  eventId: string,
  input: UpdateEventInput,
  allow: { teamIds: string[] | "all" } = { teamIds: "all" },
) {
  const { match, ...rawPatch } = input;
  const patch = Object.fromEntries(Object.entries(rawPatch).filter(([, v]) => v !== undefined));
  const [current] = await db.select().from(events).where(eq(events.id, eventId));
  if (!current) return null;
  if (allow.teamIds !== "all" && (!current.teamId || !allow.teamIds.includes(current.teamId))) {
    throw new ApiError(403, "forbidden");
  }
  if (match && current.kind !== "match") throw new ApiError(400, "invalid_request");

  if (current.bookingId && (input.startsAt || input.endsAt || input.status)) {
    await updateBooking(
      db,
      current.bookingId,
      {
        applyTo: "one",
        ...(input.startsAt ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        ...(input.status
          ? { status: bookingStatusFor(input.status, allow.teamIds !== "all") }
          : {}),
      },
      { teamIds: "all" },
    );
  }
  if (Object.keys(patch).length > 0) {
    await db.update(events).set(patch).where(eq(events.id, eventId));
  }
  const matchPatch = Object.fromEntries(
    Object.entries(match ?? {}).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(matchPatch).length > 0) {
    await db.update(eventMatches).set(matchPatch).where(eq(eventMatches.eventId, eventId));
  }
  return getEvent(db, eventId);
}

const spaceVenue = alias(venues, "space_venue");

const eventView = {
  id: events.id,
  kind: events.kind,
  status: events.status,
  title: events.title,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  seriesId: events.seriesId,
  teamId: events.teamId,
  teamName: teams.name,
  bookingId: events.bookingId,
  bookingStatus: bookings.status,
  spaceId: bookings.spaceId,
  spaceName: spaces.name,
  venueName: sql<string | null>`coalesce(${venues.name}, ${spaceVenue.name})`,
  location: events.location,
  notes: events.notes,
  matchType: eventMatches.matchType,
  competition: eventMatches.competition,
  round: eventMatches.round,
  format: eventMatches.format,
  opponent: eventMatches.opponent,
  homeAway: eventMatches.homeAway,
  kit: eventMatches.kit,
  transport: eventMatches.transport,
  medicalCover: eventMatches.medicalCover,
  updatedAt: events.updatedAt,
};

const eventQuery = (db: Db) =>
  db
    .select(eventView)
    .from(events)
    .leftJoin(teams, eq(teams.id, events.teamId))
    .leftJoin(bookings, eq(bookings.id, events.bookingId))
    .leftJoin(spaces, eq(spaces.id, bookings.spaceId))
    .leftJoin(spaceVenue, eq(spaceVenue.id, spaces.venueId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .leftJoin(eventMatches, eq(eventMatches.eventId, events.id));

/** Events that overlap [from, to), earliest first. */
export function listEvents(
  db: Db,
  filter: { from: Date; to: Date; teamId?: string; kind?: EventKind },
) {
  return eventQuery(db)
    .where(
      and(
        lt(events.startsAt, filter.to),
        gt(events.endsAt, filter.from),
        filter.teamId ? eq(events.teamId, filter.teamId) : undefined,
        filter.kind ? eq(events.kind, filter.kind) : undefined,
      ),
    )
    .orderBy(asc(events.startsAt), asc(events.id));
}

export async function getEvent(db: Db, eventId: string) {
  const [event] = await eventQuery(db).where(eq(events.id, eventId));
  return event ?? null;
}
