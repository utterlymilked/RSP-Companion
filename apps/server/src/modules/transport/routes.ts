import { createRideSchema, type Permission, updateRideSchema } from "@rsc/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../../db/index.js";
import { writeOrApiError } from "../../http/db-errors.js";
import { ApiError, forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf } from "../access/middleware.js";
import { isSelfOrWard, type Principal, readScope } from "../access/service.js";
import { events } from "../events/schema.js";
import { guardianships } from "../people/schema.js";
import {
  calledUpAmong,
  createRide,
  deleteRide,
  findRide,
  isCalledUp,
  listRides,
  seatPassenger,
  unseatPassenger,
  updateRide,
} from "./service.js";

const eventParam = z.object({ eventId: z.uuid() });
const rideParam = z.object({ rideId: z.uuid() });
const seatParam = rideParam.extend({ personId: z.uuid() });

/** Whether `principal` holds `permission` for the team (club-wide grants cover every team). */
function covers(principal: Principal, permission: Permission, teamId: string | null) {
  const scope = readScope(principal, permission);
  return scope === "all" || (teamId !== null && scope.teamIds.includes(teamId));
}

async function eventOr404(db: Db, eventId: string) {
  const [event] = await db
    .select({ id: events.id, teamId: events.teamId })
    .from(events)
    .where(eq(events.id, eventId));
  if (!event) throw notFound();
  return event;
}

/** The principal's own person and their wards. */
async function ownPeople(db: Db, principal: Principal) {
  if (!principal.personId) return [];
  const wards = await db
    .select({ id: guardianships.childId })
    .from(guardianships)
    .where(eq(guardianships.guardianId, principal.personId));
  return [principal.personId, ...wards.map((w) => w.id)];
}

/**
 * /api/transport: club vans and carpools for an event (ADR 0011). Coaches, delegados and the
 * office (`callups.read` / `callups.write` over the event's team) manage every ride; athletes
 * and guardians see the rides of events they or their wards are called up for, offer a
 * carpool and take a seat in one. A driver's phone shows only to people who ride with them.
 */
export const transportRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/events/:eventId", validate("param", eventParam), async (c) => {
      const principal = principalOf(c);
      const event = await eventOr404(db, c.req.valid("param").eventId);
      const manager = covers(principal, "callups.read", event.teamId);
      const own = await ownPeople(db, principal);
      const participating = await calledUpAmong(db, event.id, own);
      if (!manager && participating.length === 0) throw forbidden();
      const viewer = { userId: principal.userId, manager, personIds: own };
      return c.json({ rides: await listRides(db, event.id, viewer) });
    })
    .post(
      "/events/:eventId/rides",
      validate("param", eventParam),
      validate("json", createRideSchema),
      async (c) => {
        const principal = principalOf(c);
        const event = await eventOr404(db, c.req.valid("param").eventId);
        const input = c.req.valid("json");
        if (!covers(principal, "callups.write", event.teamId)) {
          // A participant may only offer a carpool, driving it themselves.
          const own = await ownPeople(db, principal);
          const participating = await calledUpAmong(db, event.id, own);
          const driving =
            principal.personId !== null && input.driverPersonId === principal.personId;
          if (input.kind !== "carpool" || !driving || participating.length === 0) {
            throw forbidden();
          }
        }
        const ride = await writeOrApiError(db, (tx) =>
          createRide(tx, event.id, input, principal.userId),
        );
        return c.json({ id: ride?.id }, 201);
      },
    )
    .patch(
      "/rides/:rideId",
      validate("param", rideParam),
      validate("json", updateRideSchema),
      async (c) => {
        const principal = principalOf(c);
        const ride = await findRide(db, c.req.valid("param").rideId);
        if (!ride) throw notFound();
        await assertCanManage(db, principal, ride);
        const input = c.req.valid("json");
        // Naming another driver would show that person's phone to the passengers.
        if (input.driverPersonId !== undefined && !(await isManager(db, principal, ride))) {
          throw forbidden();
        }
        await writeOrApiError(db, (tx) => updateRide(tx, ride.id, input));
        return c.body(null, 204);
      },
    )
    .delete("/rides/:rideId", validate("param", rideParam), async (c) => {
      const principal = principalOf(c);
      const ride = await findRide(db, c.req.valid("param").rideId);
      if (!ride) throw notFound();
      await assertCanManage(db, principal, ride);
      await deleteRide(db, ride.id);
      return c.body(null, 204);
    })
    .put("/rides/:rideId/passengers/:personId", validate("param", seatParam), async (c) => {
      const principal = principalOf(c);
      const { rideId, personId } = c.req.valid("param");
      const ride = await findRide(db, rideId);
      if (!ride) throw notFound();
      const event = await eventOr404(db, ride.eventId);
      const manager = covers(principal, "callups.write", event.teamId);
      // Participants seat themselves and their wards, in carpools only; vans are assigned
      // by the managers.
      const allowed =
        manager || (ride.kind === "carpool" && (await isSelfOrWard(db, principal, personId)));
      if (!allowed) throw forbidden();
      if (!(await isCalledUp(db, ride.eventId, personId))) {
        throw new ApiError(409, "not_called_up");
      }
      await writeOrApiError(db, (tx) => seatPassenger(tx, ride, personId, principal.userId));
      return c.body(null, 204);
    })
    .delete("/rides/:rideId/passengers/:personId", validate("param", seatParam), async (c) => {
      const principal = principalOf(c);
      const { rideId, personId } = c.req.valid("param");
      const ride = await findRide(db, rideId);
      if (!ride) throw notFound();
      const allowed =
        (await isSelfOrWard(db, principal, personId)) || (await canManage(db, principal, ride));
      if (!allowed) throw forbidden();
      if (!(await unseatPassenger(db, rideId, personId))) throw notFound();
      return c.body(null, 204);
    });

async function isManager(db: Db, principal: Principal, ride: RideRow) {
  const event = await eventOr404(db, ride.eventId);
  return covers(principal, "callups.write", event.teamId);
}

type RideRow = NonNullable<Awaited<ReturnType<typeof findRide>>>;

/** Managers of the event's team, the person who created the ride, and its driver. */
async function canManage(db: Db, principal: Principal, ride: RideRow) {
  if (ride.createdBy === principal.userId) return true;
  if (principal.personId && ride.driverPersonId === principal.personId) return true;
  return isManager(db, principal, ride);
}

async function assertCanManage(db: Db, principal: Principal, ride: RideRow) {
  if (!(await canManage(db, principal, ride))) throw forbidden();
}
