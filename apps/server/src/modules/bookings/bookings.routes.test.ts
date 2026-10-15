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
} from "../../test/factories.js";
import { roleAssignments } from "../auth/schema.js";

async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const dept = await makeDepartment(db, org.id);
  const space = await makeSpace(db);
  const body = (extra: Record<string, unknown> = {}) => ({
    spaceId: space.id,
    departmentId: dept.id,
    activity: "training",
    startsAt: "2026-11-02T18:00:00Z",
    endsAt: "2026-11-02T19:00:00Z",
    ...extra,
  });
  return { org, team, otherTeam, dept, space, body, t: testApp(db) };
}
const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });
const json = async <T>(res: Response) => (await res.json()) as T;

describeDb("bookings API", () => {
  it("lets readers see the calendar but only the office write", () =>
    withRollback(async (db) => {
      const { dept, space, body, t } = await setup(db);
      await makeBooking(db, { spaceId: space.id, departmentId: dept.id });
      const day = "from=2026-11-02&to=2026-11-02";

      expect((await t.request(`/api/bookings?${day}`)).status).toBe(401);
      const athlete = await t.userWith([clubWide("athlete")]);
      expect((await t.request(`/api/bookings?${day}`, { cookie: athlete.cookie })).status).toBe(
        403,
      );
      expect((await t.request("/api/facilities", { cookie: athlete.cookie })).status).toBe(403);

      const doctor = await t.userWith([clubWide("doctor")]);
      const list = await t.request(`/api/bookings?${day}`, { cookie: doctor.cookie });
      expect((await json<{ bookings: unknown[] }>(list)).bookings).toHaveLength(1);
      expect(
        (await t.request("/api/bookings", { cookie: doctor.cookie, json: body() })).status,
      ).toBe(403);
      expect((await t.request("/api/bookings", { json: body() })).status).toBe(401);

      const staff = await t.userWith([clubWide("staff")]);
      const created = await t.request("/api/bookings", {
        cookie: staff.cookie,
        json: body({
          startsAt: "2026-11-03T18:00:00Z",
          endsAt: "2026-11-03T19:00:00Z",
          repeat: { everyWeeks: 1, until: "2026-11-17" },
        }),
      });
      expect(created.status).toBe(201);
      expect((await json<{ bookings: unknown[] }>(created)).bookings).toHaveLength(3);
    }));

  it("answers 409 booking_conflict with the clashing bookings", () =>
    withRollback(async (db) => {
      const { dept, space, body, t } = await setup(db);
      const existing = await makeBooking(db, { spaceId: space.id, departmentId: dept.id });
      const staff = await t.userWith([clubWide("staff")]);
      const res = await t.request("/api/bookings", { cookie: staff.cookie, json: body() });
      expect(res.status).toBe(409);
      const { error } = await json<{
        error: { code: string; issues: { conflicts: { id: string }[] }[] };
      }>(res);
      expect(error.code).toBe("booking_conflict");
      expect(error.issues[0]?.conflicts[0]?.id).toBe(existing.id);
    }));

  it("validates input and the query window", () =>
    withRollback(async (db) => {
      const { body, t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      const backwards = body({ startsAt: "2026-11-02T19:00:00Z", endsAt: "2026-11-02T18:00:00Z" });
      expect(
        (await t.request("/api/bookings", { cookie: staff.cookie, json: backwards })).status,
      ).toBe(400);
      const unknownSpace = body({ spaceId: "00000000-0000-4000-8000-000000000000" });
      expect(
        (await t.request("/api/bookings", { cookie: staff.cookie, json: unknownSpace })).status,
      ).toBe(404);
      const wide = await t.request("/api/bookings?from=2026-01-01&to=2026-12-31", {
        cookie: staff.cookie,
      });
      expect(wide.status).toBe(400);
      const flipped = await t.request("/api/bookings?from=2026-11-05&to=2026-11-01", {
        cookie: staff.cookie,
      });
      expect(flipped.status).toBe(400);
    }));

  it("limits a coach to requests for their own team", () =>
    withRollback(async (db) => {
      const { team, otherTeam, dept, space, body, t } = await setup(db);
      const coach = await t.userWith([coachOf(team.id)]);
      const own = await t.request("/api/bookings", {
        cookie: coach.cookie,
        json: body({ teamId: team.id, status: "confirmed" }),
      });
      expect(own.status).toBe(201);
      const { bookings } = await json<{ bookings: { id: string; status: string }[] }>(own);
      expect(bookings[0]?.status).toBe("to_confirm");

      const other = await t.request("/api/bookings", {
        cookie: coach.cookie,
        json: body({
          teamId: otherTeam.id,
          startsAt: "2026-11-09T18:00:00Z",
          endsAt: "2026-11-09T19:00:00Z",
        }),
      });
      expect(other.status).toBe(403);
      const noTeam = await t.request("/api/bookings", {
        cookie: coach.cookie,
        json: body({ startsAt: "2026-11-09T18:00:00Z", endsAt: "2026-11-09T19:00:00Z" }),
      });
      expect(noTeam.status).toBe(403);

      const id = bookings[0]?.id;
      const patch = (cookie: string, bookingId: string, change: object) =>
        t.request(`/api/bookings/${bookingId}`, { method: "PATCH", cookie, json: change });
      expect((await patch(coach.cookie, id as string, { status: "confirmed" })).status).toBe(403);
      expect((await patch(coach.cookie, id as string, { actualAttendance: 18 })).status).toBe(200);
      expect((await patch(coach.cookie, id as string, { teamId: otherTeam.id })).status).toBe(403);
      expect((await patch(coach.cookie, id as string, { status: "cancelled" })).status).toBe(200);

      const foreign = await makeBooking(
        db,
        { spaceId: space.id, departmentId: dept.id },
        {
          teamId: otherTeam.id,
          startsAt: new Date("2026-12-01T18:00:00Z"),
          endsAt: new Date("2026-12-01T19:00:00Z"),
        },
      );
      expect((await patch(coach.cookie, foreign.id, { notes: "x" })).status).toBe(403);
      const staff = await t.userWith([clubWide("staff")]);
      expect((await patch(staff.cookie, foreign.id, { status: "done" })).status).toBe(200);
      expect(
        (await patch(staff.cookie, "00000000-0000-4000-8000-000000000000", { notes: "x" })).status,
      ).toBe(404);
      const one = await t.request(`/api/bookings/${foreign.id}`, { cookie: coach.cookie });
      expect((await json<{ booking: { status: string } }>(one)).booking.status).toBe("done");
    }));

  it("manages venues and spaces for the office only", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      const coach = await t.userWith([coachOf((await makeTeam(db, await refsOf(db))).id)]);
      const staff = await t.userWith([clubWide("staff")]);
      const venue = { name: "Campo externo", kind: "external", address: null };
      expect(
        (await t.request("/api/facilities/venues", { cookie: coach.cookie, json: venue })).status,
      ).toBe(403);
      const made = await t.request("/api/facilities/venues", { cookie: staff.cookie, json: venue });
      expect(made.status).toBe(201);
      const { venue: created } = await json<{ venue: { id: string } }>(made);
      expect(
        (await t.request("/api/facilities/venues", { cookie: staff.cookie, json: venue })).status,
      ).toBe(409);

      const space = (name: string, componentIds: string[] = []) =>
        t.request("/api/facilities/spaces", {
          cookie: staff.cookie,
          json: { venueId: created.id, name, kind: "field", componentIds },
        });
      const a = await json<{ space: { id: string } }>(await space("Campo A"));
      const b = await json<{ space: { id: string } }>(await space("Campo B"));
      expect((await space("Campo A+B", [a.space.id, b.space.id])).status).toBe(201);
      const rename = await t.request(`/api/facilities/spaces/${a.space.id}`, {
        method: "PATCH",
        cookie: staff.cookie,
        json: { active: false },
      });
      expect((await json<{ space: { active: boolean } }>(rename)).space.active).toBe(false);

      const all = await json<{ spaces: { name: string; componentIds: string[] }[] }>(
        await t.request("/api/facilities", { cookie: coach.cookie }),
      );
      expect(all.spaces.find((s) => s.name === "Campo A+B")?.componentIds).toHaveLength(2);
    }));

  it("serves an iCal feed behind a secret link that follows the user's rights", () =>
    withRollback(async (db) => {
      const { dept, space, t } = await setup(db);
      await makeBooking(
        db,
        { spaceId: space.id, departmentId: dept.id },
        {
          title: "Treino",
          startsAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 90_000_000),
        },
      );
      await makeBooking(
        db,
        { spaceId: space.id, departmentId: dept.id },
        {
          title: "Anulado",
          status: "cancelled",
          startsAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 90_000_000),
        },
      );
      const staff = await t.userWith([clubWide("staff")]);
      const link = await t.request("/api/bookings/feed", { cookie: staff.cookie });
      const { url } = await json<{ url: string }>(link);
      const path = new URL(url).pathname;
      expect(path).toMatch(/^\/api\/calendar\/[\w-]+\.ics$/);
      expect(
        (
          await json<{ url: string }>(
            await t.request("/api/bookings/feed", { cookie: staff.cookie }),
          )
        ).url,
      ).toBe(url);

      const feed = await t.request(path);
      expect(feed.status).toBe(200);
      expect(feed.headers.get("content-type")).toContain("text/calendar");
      const text = await feed.text();
      expect(text).toContain("SUMMARY:Treino (");
      expect(text).not.toContain("Anulado");
      expect((await t.request("/api/calendar/not-a-token.ics")).status).toBe(404);

      const rotated = await json<{ url: string }>(
        await t.request("/api/bookings/feed/rotate", { method: "POST", cookie: staff.cookie }),
      );
      expect(rotated.url).not.toBe(url);
      expect((await t.request(path)).status).toBe(404);
      expect((await t.request(new URL(rotated.url).pathname)).status).toBe(200);

      await db.delete(roleAssignments);
      expect((await t.request(new URL(rotated.url).pathname)).status).toBe(404);
    }));
});

async function refsOf(db: Db) {
  return { seasonId: (await makeSeason(db)).id, organisationId: (await makeOrganisation(db)).id };
}
