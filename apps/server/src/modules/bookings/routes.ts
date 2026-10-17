import {
  addLocalDays,
  BLOCKING_BOOKING_STATUSES,
  buildTimetable,
  createBookingSchema,
  createSpaceSchema,
  createVenueSchema,
  listBookingsQuerySchema,
  parseLocal,
  permissionsOf,
  startOfLisbonDay,
  timetableExportQuerySchema,
  updateBookingSchema,
  updateSpaceSchema,
} from "@rsc/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { ApiError, forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import { loadPrincipal } from "../access/service.js";
import { bookingMode } from "./approval.js";
import { notifyBookingChanged, notifyBookingRequested } from "./notify.js";
import { bookings } from "./schema.js";
import {
  buildIcs,
  createBookings,
  createSpace,
  createVenue,
  feedToken,
  feedUser,
  getBooking,
  listBookings,
  listBookingsBy,
  listFacilities,
  updateBooking,
  updateSpace,
} from "./service.js";
import {
  buildTimetablePdf,
  buildTimetableXlsx,
  type ExportBooking,
  weekOf,
  weekTitle,
} from "./timetable-export.js";

/** Longest window GET /api/bookings serves, in days. */
const MAX_WINDOW_DAYS = 93;

const bookingParam = z.object({ bookingId: z.uuid() });
const spaceParam = z.object({ spaceId: z.uuid() });

/**
 * Reading the calendar is club-wide for every role that has it, including coaches and
 * delegados whose grant is limited to a team (they may only *write* for that team).
 */
const canRead = createMiddleware<AppEnv>(async (c, next) => {
  if (!permissionsOf(principalOf(c).grants).includes("bookings.read")) throw forbidden();
  await next();
});

/** Statuses a requester (anyone who is not an approver) may set: they request and withdraw. */
const REQUESTER_STATUSES = ["to_confirm", "cancelled"];

/** /api/facilities: venues, spaces (with combinations) and departments. */
export const facilitiesRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", canRead, async (c) => c.json(await listFacilities(db)))
    .post(
      "/venues",
      requirePermission("facilities.write"),
      validate("json", createVenueSchema),
      async (c) => {
        const venue = await writeOrApiError(db, (tx) => createVenue(tx, c.req.valid("json")));
        return c.json({ venue }, 201);
      },
    )
    .post(
      "/spaces",
      requirePermission("facilities.write"),
      validate("json", createSpaceSchema),
      async (c) => {
        const space = await writeOrApiError(db, (tx) => createSpace(tx, c.req.valid("json")));
        return c.json({ space }, 201);
      },
    )
    .patch(
      "/spaces/:spaceId",
      requirePermission("facilities.write"),
      validate("param", spaceParam),
      validate("json", updateSpaceSchema),
      async (c) => {
        const space = await writeOrApiError(db, (tx) =>
          updateSpace(tx, c.req.valid("param").spaceId, c.req.valid("json")),
        );
        if (!space) throw notFound();
        return c.json({ space });
      },
    );

/**
 * /api/bookings: the rooms and fields calendar. Everyone with `bookings.read` sees all
 * bookings, including the team and the name of the user who made each (the staff roles
 * that read the calendar already see each other; athletes and guardians have no access); club-wide writers book anything, coaches and delegados
 * only for their own team and only as requests the club office confirms.
 */
export const bookingsRoutes = ({ db, appUrl, mailer, push }: AppDeps) => {
  /** Rejects callers who may not book at all, before the body is validated. */
  const canWrite = createMiddleware<AppEnv>(async (c, next) => {
    await bookingMode(db, principalOf(c));
    await next();
  });
  return (
    new Hono<AppEnv>()
      .get("/", canRead, validate("query", listBookingsQuerySchema), async (c) => {
        const { from, to, ...filter } = c.req.valid("query");
        const start = startOfLisbonDay(from);
        const toLocal = parseLocal(to);
        const end = toLocal && startOfLisbonDay(`${isoDay(addLocalDays(toLocal, 1))}`);
        if (!start || !end || end <= start) throw new ApiError(400, "invalid_request");
        if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * 86_400_000 + 3_600_000) {
          throw new ApiError(400, "invalid_request");
        }
        return c.json({ bookings: await listBookings(db, { from: start, to: end, ...filter }) });
      })
      // The weekly timetable as a file, for printing or sending: same layout as the app's grid.
      .get("/timetable", canRead, validate("query", timetableExportQuerySchema), async (c) => {
        const { week, category, format, from, to } = c.req.valid("query");
        const days = weekOf(week);
        const start = startOfLisbonDay(days[0] ?? "");
        const last = parseLocal(days[6] ?? "");
        const end = last && startOfLisbonDay(isoDay(addLocalDays(last, 1)));
        if (!start || !end) throw new ApiError(400, "invalid_request");
        const [facilities, found] = await Promise.all([
          listFacilities(db),
          listBookings(db, { from: start, to: end, statuses: BLOCKING_BOOKING_STATUSES }),
        ]);
        const range = { from, to };
        const printable: ExportBooking[] = found.map((b) => ({
          ...b,
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
        }));
        const model = {
          heading: category === "fields" ? "Campos" : "Salas",
          weekTitle: weekTitle(days),
          days,
          range,
          sheets: buildTimetable(facilities.spaces, printable, days, category, range),
        };
        const name = `horario-${category === "fields" ? "campos" : "salas"}-${days[0]}`;
        const file =
          format === "xlsx" ? await buildTimetableXlsx(model) : await buildTimetablePdf(model);
        return c.body(file as Uint8Array<ArrayBuffer>, 200, {
          "content-type":
            format === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/pdf",
          "content-disposition": `attachment; filename="${name}.${format}"`,
        });
      })
      .post("/", canWrite, validate("json", createBookingSchema), async (c) => {
        const principal = principalOf(c);
        const mode = await bookingMode(db, principal);
        let input = c.req.valid("json");
        if (mode.kind === "requester") {
          const { teamIds, ownOnly } = mode;
          const teamless = ownOnly || teamIds === "all";
          if (input.teamId ? teamIds !== "all" && !teamIds.includes(input.teamId) : !teamless) {
            throw forbidden();
          }
          input = { ...input, status: "to_confirm" };
        }
        const created = await writeOrApiError(db, (tx) =>
          createBookings(tx, input, principal.userId),
        );
        await notifyBookingRequested({ db, mailer, push, appUrl }, created, principal.userId);
        return c.json({ bookings: created }, 201);
      })
      .get("/mine", canRead, async (c) => c.json(await listBookingsBy(db, principalOf(c).userId)))
      .get("/feed", canRead, async (c) =>
        c.json({ url: feedUrl(appUrl, await feedToken(db, principalOf(c).userId)) }),
      )
      .post("/feed/rotate", canRead, async (c) =>
        c.json({ url: feedUrl(appUrl, await feedToken(db, principalOf(c).userId, true)) }),
      )
      .get("/:bookingId", canRead, validate("param", bookingParam), async (c) => {
        const booking = await getBooking(db, c.req.valid("param").bookingId);
        if (!booking) throw notFound();
        return c.json({ booking });
      })
      .patch(
        "/:bookingId",
        canWrite,
        validate("param", bookingParam),
        validate("json", updateBookingSchema),
        async (c) => {
          const principal = principalOf(c);
          const mode = await bookingMode(db, principal);
          const input = c.req.valid("json");
          const { bookingId } = c.req.valid("param");
          if (
            mode.kind === "requester" &&
            input.status &&
            !REQUESTER_STATUSES.includes(input.status)
          ) {
            throw forbidden();
          }
          const allow =
            mode.kind === "approver"
              ? { teamIds: "all" as const }
              : { teamIds: mode.teamIds, ownedBy: mode.ownOnly ? principal.userId : undefined };
          const [before] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
          const updated = await writeOrApiError(db, (tx) =>
            updateBooking(tx, bookingId, input, allow),
          );
          if (!updated) throw notFound();
          const after = updated.find((b) => b.id === bookingId);
          if (before && after) {
            await notifyBookingChanged(
              { db, mailer, push, appUrl },
              before,
              after,
              principal.userId,
            );
          }
          return c.json({ bookings: updated });
        },
      )
  );
};

const isoDay = (t: { year: number; month: number; day: number }) =>
  `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;

const feedUrl = (appUrl: string, token: string) =>
  `${appUrl.replace(/\/$/, "")}/api/calendar/${token}.ics`;

/**
 * /api/calendar/<token>.ics: the iCal subscription for calendar apps. The unguessable token
 * is the credential (apps cannot sign in); it stops working when the user loses
 * `bookings.read`. Cancelled and unconfirmed bookings are left out.
 */
export const calendarRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>().get("/:file", async (c) => {
    const token = c.req.param("file").replace(/\.ics$/, "");
    const userId = await feedUser(db, token);
    const principal = userId ? await loadPrincipal(db, userId) : null;
    if (!principal || !permissionsOf(principal.grants).includes("bookings.read")) throw notFound();
    const now = Date.now();
    const items = await listBookings(db, {
      from: new Date(now - 30 * 86_400_000),
      to: new Date(now + 400 * 86_400_000),
      statuses: BLOCKING_BOOKING_STATUSES,
    });
    return c.body(buildIcs(items), 200, {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, no-store",
    });
  });
