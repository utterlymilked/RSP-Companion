import {
  addLocalDays,
  createEventSchema,
  listEventsQuerySchema,
  parseLocal,
  permissionsOf,
  startOfLisbonDay,
  updateEventSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { ApiError, forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf } from "../access/middleware.js";
import { readScope } from "../access/service.js";
import { createEvents, getEvent, listEvents, updateEvent } from "./service.js";

/** Longest window GET /api/events serves, in days. */
const MAX_WINDOW_DAYS = 93;

const eventParam = z.object({ eventId: z.uuid() });

/** `"all"` for club-wide writers, else the teams a coach or delegado may write for. */
function writeScope(c: Parameters<typeof principalOf>[0]): "all" | string[] {
  const scope = readScope(principalOf(c), "events.write");
  if (scope === "all") return "all";
  if (scope.teamIds.length === 0) throw forbidden();
  return scope.teamIds;
}

/** Rejects callers who may not write events at all, before the body is validated. */
const canWrite = createMiddleware<AppEnv>(async (c, next) => {
  writeScope(c);
  await next();
});

/** Reading is club-wide for every role that has it, including team-limited coaches. */
const canRead = createMiddleware<AppEnv>(async (c, next) => {
  if (!permissionsOf(principalOf(c).grants).includes("events.read")) throw forbidden();
  await next();
});

const isoDay = (t: { year: number; month: number; day: number }) =>
  `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;

/**
 * /api/events: trainings, matches and club events. Everyone with `events.read` sees all of
 * them (no personal data); club-wide writers write anything, coaches and delegados only for
 * their own team, and the spaces they reserve stay requests the club office confirms.
 */
export const eventsRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", canRead, validate("query", listEventsQuerySchema), async (c) => {
      const { from, to, ...filter } = c.req.valid("query");
      const start = startOfLisbonDay(from);
      const toLocal = parseLocal(to);
      const end = toLocal && startOfLisbonDay(isoDay(addLocalDays(toLocal, 1)));
      if (!start || !end || end <= start) throw new ApiError(400, "invalid_request");
      if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * 86_400_000 + 3_600_000) {
        throw new ApiError(400, "invalid_request");
      }
      return c.json({ events: await listEvents(db, { from: start, to: end, ...filter }) });
    })
    .post("/", canWrite, validate("json", createEventSchema), async (c) => {
      const scope = writeScope(c);
      const input = c.req.valid("json");
      if (scope !== "all" && (!input.teamId || !scope.includes(input.teamId))) throw forbidden();
      const created = await writeOrApiError(db, (tx) =>
        createEvents(tx, input, { createdBy: principalOf(c).userId, requestOnly: scope !== "all" }),
      );
      return c.json({ events: created }, 201);
    })
    .get("/:eventId", canRead, validate("param", eventParam), async (c) => {
      const event = await getEvent(db, c.req.valid("param").eventId);
      if (!event) throw notFound();
      return c.json({ event });
    })
    .patch(
      "/:eventId",
      canWrite,
      validate("param", eventParam),
      validate("json", updateEventSchema),
      async (c) => {
        const scope = writeScope(c);
        const event = await writeOrApiError(db, (tx) =>
          updateEvent(tx, c.req.valid("param").eventId, c.req.valid("json"), { teamIds: scope }),
        );
        if (!event) throw notFound();
        return c.json({ event });
      },
    );
