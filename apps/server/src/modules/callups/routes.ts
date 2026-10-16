import {
  addLocalDays,
  attendanceStatsQuerySchema,
  attendanceSyncSchema,
  callUpSchema,
  type Permission,
  parseLocal,
  rsvpSchema,
  startOfLisbonDay,
} from "@rsc/shared";
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
  attendanceStats,
  callUp,
  listCallUpsFor,
  listParticipants,
  removeCallUp,
  setRsvp,
  syncAttendance,
} from "./service.js";

const eventParam = z.object({ eventId: z.uuid() });
const personParam = eventParam.extend({ personId: z.uuid() });

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

const isoDay = (t: { year: number; month: number; day: number }) =>
  `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;

/**
 * /api/callups: call-ups (convocatórias), answers and attendance. Coaches, delegados and the
 * office with `callups.read` / `callups.write` act on the events of their team; athletes and
 * guardians answer only for themselves and their wards, and see only their own call-ups.
 */
export const callupsRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/mine", async (c) => {
      const principal = principalOf(c);
      if (!principal.personId) return c.json({ callUps: [] });
      const wards = await db
        .select({ id: guardianships.childId })
        .from(guardianships)
        .where(eq(guardianships.guardianId, principal.personId));
      const ids = [principal.personId, ...wards.map((w) => w.id)];
      // A session that ended this morning still shows, so the answer can be corrected.
      const since = new Date(Date.now() - 12 * 3_600_000);
      return c.json({ callUps: await listCallUpsFor(db, ids, since) });
    })
    .get("/stats", validate("query", attendanceStatsQuerySchema), async (c) => {
      const { teamId, from, to } = c.req.valid("query");
      if (!covers(principalOf(c), "callups.read", teamId)) throw forbidden();
      const start = startOfLisbonDay(from);
      const toLocal = parseLocal(to);
      const end = toLocal && startOfLisbonDay(isoDay(addLocalDays(toLocal, 1)));
      if (!start || !end || end <= start) throw new ApiError(400, "invalid_request");
      return c.json({ stats: await attendanceStats(db, teamId, start, end) });
    })
    .get("/events/:eventId", validate("param", eventParam), async (c) => {
      const event = await eventOr404(db, c.req.valid("param").eventId);
      if (!covers(principalOf(c), "callups.read", event.teamId)) throw forbidden();
      return c.json({ participants: await listParticipants(db, event.id) });
    })
    .post(
      "/events/:eventId",
      validate("param", eventParam),
      validate("json", callUpSchema),
      async (c) => {
        const principal = principalOf(c);
        const event = await eventOr404(db, c.req.valid("param").eventId);
        if (!covers(principal, "callups.write", event.teamId)) throw forbidden();
        const { personIds } = c.req.valid("json");
        const added = await writeOrApiError(db, (tx) =>
          callUp(tx, event, personIds, principal.userId),
        );
        return c.json({ added, participants: await listParticipants(db, event.id) }, 201);
      },
    )
    .delete("/events/:eventId/people/:personId", validate("param", personParam), async (c) => {
      const { eventId, personId } = c.req.valid("param");
      const event = await eventOr404(db, eventId);
      if (!covers(principalOf(c), "callups.write", event.teamId)) throw forbidden();
      if (!(await removeCallUp(db, eventId, personId))) throw notFound();
      return c.body(null, 204);
    })
    .put(
      "/events/:eventId/attendance",
      validate("param", eventParam),
      validate("json", attendanceSyncSchema),
      async (c) => {
        const principal = principalOf(c);
        const event = await eventOr404(db, c.req.valid("param").eventId);
        if (!covers(principal, "callups.write", event.teamId)) throw forbidden();
        const { marks } = c.req.valid("json");
        await writeOrApiError(db, (tx) => syncAttendance(tx, event.id, marks, principal.userId));
        return c.json({ participants: await listParticipants(db, event.id) });
      },
    )
    .put(
      "/events/:eventId/people/:personId/rsvp",
      validate("param", personParam),
      validate("json", rsvpSchema),
      async (c) => {
        const principal = principalOf(c);
        const { eventId, personId } = c.req.valid("param");
        const event = await eventOr404(db, eventId);
        const allowed =
          (await isSelfOrWard(db, principal, personId)) ||
          covers(principal, "callups.write", event.teamId);
        if (!allowed) throw forbidden();
        const ok = await writeOrApiError(db, (tx) =>
          setRsvp(tx, eventId, personId, c.req.valid("json"), principal.userId),
        );
        if (!ok) throw notFound();
        return c.json({ rsvp: c.req.valid("json").rsvp });
      },
    );
