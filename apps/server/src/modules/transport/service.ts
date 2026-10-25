import type { CreateRideInput, UpdateRideInput } from "@rsc/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import { eventParticipants } from "../callups/schema.js";
import { loadPersonalFacts } from "../people/facts.js";
import { persons } from "../people/schema.js";
import { transportPassengers, transportRides } from "./schema.js";

/** Who is asking, as far as transport is concerned. */
export interface Viewer {
  userId: string;
  /** Club-wide or team manager of the event (may see and change every ride). */
  manager: boolean;
  /** The viewer and their wards: the people whose seats and rides they may see. */
  personIds: string[];
}

const nameOf = sql<string>`coalesce(${persons.displayName}, ${persons.fullName})`;

/** A ride's event and, for rides, who drives and who created it. */
export async function findRide(db: Db, rideId: string) {
  const [ride] = await db.select().from(transportRides).where(eq(transportRides.id, rideId));
  return ride;
}

/** Whether `personId` is called up for the event. */
export async function isCalledUp(db: Db, eventId: string, personId: string) {
  const [row] = await db
    .select({ id: eventParticipants.id })
    .from(eventParticipants)
    .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.personId, personId)));
  return Boolean(row);
}

/** The subset of `personIds` called up for the event. */
export async function calledUpAmong(db: Db, eventId: string, personIds: string[]) {
  if (personIds.length === 0) return [];
  const rows = await db
    .select({ personId: eventParticipants.personId })
    .from(eventParticipants)
    .where(
      and(eq(eventParticipants.eventId, eventId), inArray(eventParticipants.personId, personIds)),
    );
  return rows.map((r) => r.personId);
}

/**
 * Rides of an event as `viewer` may see them. Passenger names and the driver's phone are
 * personal data: managers see passenger names only; a driver's phone shows only to the
 * driver, and to people who ride with them (themselves or their wards).
 */
export async function listRides(db: Db, eventId: string, viewer: Viewer) {
  const rides = await db
    .select({
      id: transportRides.id,
      kind: transportRides.kind,
      label: transportRides.label,
      seats: transportRides.seats,
      pickupPoint: transportRides.pickupPoint,
      pickupAt: transportRides.pickupAt,
      notes: transportRides.notes,
      createdBy: transportRides.createdBy,
      driverPersonId: transportRides.driverPersonId,
      driverName: nameOf,
    })
    .from(transportRides)
    .leftJoin(persons, eq(persons.id, transportRides.driverPersonId))
    .where(eq(transportRides.eventId, eventId))
    .orderBy(asc(transportRides.pickupAt), asc(transportRides.createdAt));
  const driverFacts = await loadPersonalFacts(
    db,
    rides.map((r) => r.driverPersonId).filter((id): id is string => id !== null),
  );
  const seatsTaken = await db
    .select({
      rideId: transportPassengers.rideId,
      personId: transportPassengers.personId,
      name: nameOf,
    })
    .from(transportPassengers)
    .innerJoin(persons, eq(persons.id, transportPassengers.personId))
    .where(eq(transportPassengers.eventId, eventId))
    .orderBy(asc(persons.fullName));
  return rides.map((r) => {
    const passengers = seatsTaken.filter((p) => p.rideId === r.id);
    const mine = passengers.filter((p) => viewer.personIds.includes(p.personId));
    const isDriver = r.driverPersonId !== null && viewer.personIds.includes(r.driverPersonId);
    const showPhone = isDriver || mine.length > 0;
    return {
      id: r.id,
      kind: r.kind,
      label: r.label,
      seats: r.seats,
      taken: passengers.length,
      pickupPoint: r.pickupPoint,
      pickupAt: r.pickupAt,
      notes: r.notes,
      driverName: r.driverName,
      driverPhone: showPhone ? (driverFacts.get(r.driverPersonId ?? "")?.phone ?? null) : null,
      isDriver,
      canManage: viewer.manager || r.createdBy === viewer.userId || isDriver,
      passengers: viewer.manager ? passengers : mine,
      // People of the viewer (themselves, their wards) seated in this ride.
      mine: mine.map((p) => p.personId),
    };
  });
}

export async function createRide(db: Db, eventId: string, input: CreateRideInput, userId: string) {
  const [ride] = await db
    .insert(transportRides)
    .values({
      eventId,
      kind: input.kind,
      label: input.label,
      driverPersonId: input.driverPersonId,
      seats: input.seats,
      pickupPoint: input.pickupPoint,
      pickupAt: input.pickupAt,
      notes: input.notes,
      createdBy: userId,
    })
    .returning();
  return ride;
}

/** Changes a ride. Fewer seats than passengers is refused (409 ride_full). */
export async function updateRide(db: Db, rideId: string, input: UpdateRideInput) {
  const [locked] = await db
    .select({ id: transportRides.id })
    .from(transportRides)
    .where(eq(transportRides.id, rideId))
    .for("update");
  if (!locked) return null;
  if (input.seats !== undefined) {
    const taken = await countPassengers(db, rideId);
    if (input.seats < taken) throw new ApiError(409, "ride_full");
  }
  const [ride] = await db
    .update(transportRides)
    .set(input)
    .where(eq(transportRides.id, rideId))
    .returning();
  return ride ?? null;
}

export async function deleteRide(db: Db, rideId: string) {
  const rows = await db
    .delete(transportRides)
    .where(eq(transportRides.id, rideId))
    .returning({ id: transportRides.id });
  return rows.length > 0;
}

async function countPassengers(db: Db, rideId: string, except?: string) {
  const rows = await db
    .select({ personId: transportPassengers.personId })
    .from(transportPassengers)
    .where(eq(transportPassengers.rideId, rideId));
  return rows.filter((r) => r.personId !== except).length;
}

/**
 * Seats a person in a ride (moving them from another ride of the event). The ride row is
 * locked while seats are counted, so two people cannot take the last seat together.
 */
export async function seatPassenger(
  db: Db,
  ride: { id: string; eventId: string },
  personId: string,
  userId: string,
) {
  const [locked] = await db
    .select({ seats: transportRides.seats })
    .from(transportRides)
    .where(eq(transportRides.id, ride.id))
    .for("update");
  if (!locked) return false;
  if ((await countPassengers(db, ride.id, personId)) >= locked.seats) {
    throw new ApiError(409, "ride_full");
  }
  await db
    .insert(transportPassengers)
    .values({ rideId: ride.id, eventId: ride.eventId, personId, assignedBy: userId })
    .onConflictDoUpdate({
      target: [transportPassengers.eventId, transportPassengers.personId],
      set: { rideId: ride.id, assignedBy: userId, updatedAt: new Date() },
    });
  return true;
}

/** Frees a seat. Returns whether the person had one in that ride. */
export async function unseatPassenger(db: Db, rideId: string, personId: string) {
  const rows = await db
    .delete(transportPassengers)
    .where(and(eq(transportPassengers.rideId, rideId), eq(transportPassengers.personId, personId)))
    .returning({ id: transportPassengers.id });
  return rows.length > 0;
}
