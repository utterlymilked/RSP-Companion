import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import {
  makeBooking,
  makeDepartment,
  makeOrganisation,
  makeSeason,
  makeSpace,
  makeTeam,
  makeVenue,
} from "../../test/factories.js";

async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const dept = await makeDepartment(db, org.id);
  const space = await makeSpace(db);
  const training = (extra: Record<string, unknown> = {}) => ({
    kind: "training",
    teamId: team.id,
    startsAt: "2026-11-02T18:00:00Z",
    endsAt: "2026-11-02T19:00:00Z",
    ...extra,
  });
  const match = (extra: Record<string, unknown> = {}) => ({
    kind: "match",
    teamId: team.id,
    startsAt: "2026-11-07T10:00:00Z",
    endsAt: "2026-11-07T11:30:00Z",
    match: {
      matchType: "league",
      round: "3",
      format: "fut7",
      opponent: "Clube X",
      homeAway: "home",
    },
    ...extra,
  });
  return { org, team, otherTeam, dept, space, training, match, t: testApp(db) };
}
const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });
const json = async <T>(res: Response) => (await res.json()) as T;
type Created = { events: { id: string; bookingId: string | null }[] };

describeDb("events API", () => {
  it("lets readers see the calendar but only coaches and the office write", () =>
    withRollback(async (db) => {
      const { match, t } = await setup(db);
      const day = "from=2026-11-01&to=2026-11-30";
      expect((await t.request(`/api/events?${day}`)).status).toBe(401);
      const athlete = await t.userWith([clubWide("athlete")]);
      expect((await t.request(`/api/events?${day}`, { cookie: athlete.cookie })).status).toBe(403);

      const staff = await t.userWith([clubWide("staff")]);
      expect((await t.request("/api/events", { cookie: staff.cookie, json: match() })).status).toBe(
        201,
      );

      const doctor = await t.userWith([clubWide("doctor")]);
      const list = await t.request(`/api/events?${day}`, { cookie: doctor.cookie });
      const { events } = await json<{ events: { opponent: string; teamName: string }[] }>(list);
      expect(events).toHaveLength(1);
      expect(events[0]?.opponent).toBe("Clube X");
      expect(
        (await t.request("/api/events", { cookie: doctor.cookie, json: match() })).status,
      ).toBe(403);
      expect((await t.request("/api/events", { json: match() })).status).toBe(401);
    }));

  it("requires match details for matches only", () =>
    withRollback(async (db) => {
      const { match, training, t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      const post = (json: unknown) => t.request("/api/events", { cookie: staff.cookie, json });
      expect((await post(match({ match: null }))).status).toBe(400);
      expect(((await post(training({ match: match().match }))) as Response).status).toBe(400);
      expect(
        (await post(training({ repeat: { everyWeeks: 1, until: "2026-11-09" } }))).status,
      ).toBe(201);
      expect((await post(match({ repeat: { everyWeeks: 1, until: "2026-12-01" } }))).status).toBe(
        400,
      );
      expect(
        (await post(training({ spaceId: "00000000-0000-4000-8000-000000000000" }))).status,
      ).toBe(400);
    }));

  it("books the space and repeats trainings weekly", () =>
    withRollback(async (db) => {
      const { dept, space, training, t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      const res = await t.request("/api/events", {
        cookie: staff.cookie,
        json: training({
          spaceId: space.id,
          departmentId: dept.id,
          repeat: { everyWeeks: 1, until: "2026-11-16" },
        }),
      });
      expect(res.status).toBe(201);
      const { events } = await json<Created>(res);
      expect(events).toHaveLength(3);
      expect(events.every((e) => e.bookingId)).toBe(true);

      const list = await t.request("/api/events?from=2026-11-02&to=2026-11-02", {
        cookie: staff.cookie,
      });
      const { events: day } = await json<{
        events: { spaceName: string; bookingStatus: string }[];
      }>(list);
      expect(day[0]?.spaceName).toBe(space.name);
      expect(day[0]?.bookingStatus).toBe("confirmed");
    }));

  it("answers 409 when the space is taken and creates nothing", () =>
    withRollback(async (db) => {
      const { dept, space, training, t } = await setup(db);
      await makeBooking(db, { spaceId: space.id, departmentId: dept.id });
      const staff = await t.userWith([clubWide("staff")]);
      const res = await t.request("/api/events", {
        cookie: staff.cookie,
        json: training({ spaceId: space.id, departmentId: dept.id }),
      });
      expect(res.status).toBe(409);
      const list = await t.request("/api/events?from=2026-11-01&to=2026-11-30", {
        cookie: staff.cookie,
      });
      expect((await json<{ events: unknown[] }>(list)).events).toHaveLength(0);
    }));

  it("keeps the booking in step when an event is moved or cancelled", () =>
    withRollback(async (db) => {
      const { dept, space, training, t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      const created = await t.request("/api/events", {
        cookie: staff.cookie,
        json: training({ spaceId: space.id, departmentId: dept.id }),
      });
      const [event] = (await json<Created>(created)).events;
      const patch = (body: unknown) =>
        t.request(`/api/events/${event?.id}`, {
          method: "PATCH",
          cookie: staff.cookie,
          json: body,
        });

      const moved = await patch({
        startsAt: "2026-11-02T20:00:00Z",
        endsAt: "2026-11-02T21:00:00Z",
      });
      expect(moved.status).toBe(200);
      expect((await json<{ event: { startsAt: string } }>(moved)).event.startsAt).toBe(
        "2026-11-02T20:00:00.000Z",
      );

      const cancelled = await patch({ status: "cancelled", notes: "Chuva" });
      const body = await json<{ event: { status: string; bookingStatus: string; notes: string } }>(
        cancelled,
      );
      expect(body.event).toMatchObject({
        status: "cancelled",
        bookingStatus: "cancelled",
        notes: "Chuva",
      });

      await makeBooking(
        db,
        { spaceId: space.id, departmentId: dept.id },
        { startsAt: new Date("2026-11-02T20:00:00Z"), endsAt: new Date("2026-11-02T21:00:00Z") },
      );
      expect((await patch({ status: "scheduled" })).status).toBe(409);
      expect(
        (
          await t.request("/api/events/00000000-0000-4000-8000-000000000000", {
            method: "PATCH",
            cookie: staff.cookie,
            json: { notes: "x" },
          })
        ).status,
      ).toBe(404);
    }));

  it("updates match details and refuses them on other kinds", () =>
    withRollback(async (db) => {
      const { match, training, t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      const venue = await makeVenue(db);
      const [m] = (
        await json<Created>(
          await t.request("/api/events", {
            cookie: staff.cookie,
            json: match({ venueId: venue.id }),
          }),
        )
      ).events;
      const [tr] = (
        await json<Created>(
          await t.request("/api/events", { cookie: staff.cookie, json: training() }),
        )
      ).events;
      const patch = (id?: string, body: unknown = {}) =>
        t.request(`/api/events/${id}`, { method: "PATCH", cookie: staff.cookie, json: body });
      const ok = await patch(m?.id, {
        match: { transport: "Autocarro", kit: "Preto" },
        status: "played",
      });
      expect(ok.status).toBe(200);
      expect(
        (await json<{ event: { transport: string; opponent: string; venueName: string } }>(ok))
          .event,
      ).toMatchObject({ transport: "Autocarro", opponent: "Clube X", venueName: venue.name });
      expect((await patch(tr?.id, { match: { kit: "Preto" } })).status).toBe(400);
    }));

  it("limits a coach to events of their own team, as booking requests", () =>
    withRollback(async (db) => {
      const { team, otherTeam, dept, space, training, t } = await setup(db);
      const coach = await t.userWith([coachOf(team.id)]);
      const post = (body: unknown) =>
        t.request("/api/events", { cookie: coach.cookie, json: body });
      const own = await post(training({ spaceId: space.id, departmentId: dept.id }));
      expect(own.status).toBe(201);
      const [event] = (await json<Created>(own)).events;
      const list = await t.request("/api/events?from=2026-11-02&to=2026-11-02", {
        cookie: coach.cookie,
      });
      expect(
        (await json<{ events: { bookingStatus: string }[] }>(list)).events[0]?.bookingStatus,
      ).toBe("to_confirm");

      expect((await post(training({ teamId: otherTeam.id }))).status).toBe(403);
      expect((await post(training({ teamId: null }))).status).toBe(403);

      const staff = await t.userWith([clubWide("staff")]);
      const other = await t.request("/api/events", {
        cookie: staff.cookie,
        json: training({
          teamId: otherTeam.id,
          startsAt: "2026-11-09T18:00:00Z",
          endsAt: "2026-11-09T19:00:00Z",
        }),
      });
      const [theirs] = (await json<Created>(other)).events;
      const patch = (id?: string) =>
        t.request(`/api/events/${id}`, {
          method: "PATCH",
          cookie: coach.cookie,
          json: { notes: "Atualizado" },
        });
      expect((await patch(theirs?.id)).status).toBe(403);
      expect((await patch(event?.id)).status).toBe(200);
    }));

  it("validates the query window", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      for (const q of ["from=2026-01-01&to=2026-12-31", "from=2026-11-05&to=2026-11-01"]) {
        expect((await t.request(`/api/events?${q}`, { cookie: staff.cookie })).status).toBe(400);
      }
    }));
});
