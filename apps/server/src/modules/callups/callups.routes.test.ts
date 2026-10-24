import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { guardianships } from "../people/schema.js";
import { teamMembers } from "../teams/schema.js";

const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });
const json = async <T>(res: Response) => (await res.json()) as T;
type People = {
  participants: { personId: string; athleteId: string; rsvp: string; attendance: string | null }[];
};

async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const [anna, bruno, carla] = [await makePerson(db), await makePerson(db), await makePerson(db)];
  await db.insert(teamMembers).values([
    { teamId: team.id, personId: anna.id, joinedOn: "2026-09-01" },
    { teamId: team.id, personId: bruno.id, joinedOn: "2026-09-01" },
    { teamId: team.id, personId: carla.id, joinedOn: "2026-09-01", leftOn: "2026-10-01" },
  ]);
  const t = testApp(db);
  const staff = await t.userWith([clubWide("staff")]);
  const make = async (teamId: string) => {
    const res = await t.request("/api/events", {
      cookie: staff.cookie,
      json: {
        kind: "training",
        teamId,
        startsAt: "2026-11-02T18:00:00Z",
        endsAt: "2026-11-02T19:00:00Z",
      },
    });
    return (await json<{ events: { id: string }[] }>(res)).events[0]?.id as string;
  };
  return { team, otherTeam, anna, bruno, carla, t, staff, event: await make(team.id), make };
}

describeDb("call-ups API", () => {
  it("calls up the current roster and lets only the team's coach do it", () =>
    withRollback(async (db) => {
      const { team, otherTeam, anna, bruno, t, event, make } = await setup(db);
      const url = `/api/callups/events/${event}`;
      expect((await t.request(url, { json: {} })).status).toBe(401);
      const athlete = await t.userWith([{ role: "athlete", teamId: null, classId: null }]);
      expect((await t.request(url, { cookie: athlete.cookie, json: {} })).status).toBe(403);
      const other = await t.userWith([coachOf(otherTeam.id)]);
      expect((await t.request(url, { cookie: other.cookie, json: {} })).status).toBe(403);
      expect((await t.request(url, { cookie: other.cookie })).status).toBe(403);

      const coach = await t.userWith([coachOf(team.id)]);
      const res = await t.request(url, { cookie: coach.cookie, json: {} });
      expect(res.status).toBe(201);
      const body = await json<People & { added: string[] }>(res);
      expect(body.added.sort()).toEqual([anna.id, bruno.id].sort());
      expect(body.participants.every((p) => p.rsvp === "pending")).toBe(true);
      expect(body.participants.every((p) => p.athleteId)).toBe(true);
      // Calling up again adds nobody.
      const again = await json<{ added: string[] }>(
        await t.request(url, { cookie: coach.cookie, json: {} }),
      );
      expect(again.added).toEqual([]);

      expect((await t.request(url, { cookie: coach.cookie })).status).toBe(200);
      const away = await make(otherTeam.id);
      expect(
        (await t.request(`/api/callups/events/${away}`, { cookie: coach.cookie })).status,
      ).toBe(403);
      const removed = await t.request(`${url}/people/${anna.id}`, {
        cookie: coach.cookie,
        method: "DELETE",
      });
      expect(removed.status).toBe(204);
    }));

  it("lets an athlete and a guardian answer for themselves and their wards only", () =>
    withRollback(async (db) => {
      const { team, anna, bruno, t, event, staff } = await setup(db);
      const parent = await makePerson(db);
      await db
        .insert(guardianships)
        .values({ guardianId: parent.id, childId: anna.id, relationship: "mother" });
      await t.request(`/api/callups/events/${event}`, { cookie: staff.cookie, json: {} });

      const athlete = await t.userWith([], { personId: bruno.id });
      const guardian = await t.userWith([], { personId: parent.id });
      const answer = (cookie: string, personId: string, rsvp: string) =>
        t.request(`/api/callups/events/${event}/people/${personId}/rsvp`, {
          cookie,
          method: "PUT",
          json: { rsvp, note: rsvp === "not_going" ? "doente" : null },
        });
      expect((await answer(athlete.cookie, bruno.id, "going")).status).toBe(200);
      expect((await answer(athlete.cookie, anna.id, "going")).status).toBe(403);
      expect((await answer(guardian.cookie, anna.id, "not_going")).status).toBe(200);
      expect((await answer(guardian.cookie, bruno.id, "going")).status).toBe(403);

      const list = await json<People>(
        await t.request(`/api/callups/events/${event}`, { cookie: staff.cookie }),
      );
      const by = Object.fromEntries(list.participants.map((p) => [p.personId, p.rsvp]));
      expect(by).toEqual({ [bruno.id]: "going", [anna.id]: "not_going" });
      // Not called up, so nothing to answer.
      const stranger = await makePerson(db);
      expect((await answer(staff.cookie, stranger.id, "going")).status).toBe(404);
      expect(team.id).toBeTruthy();
    }));

  it("replays attendance marks safely: newest mark wins, old ones are ignored", () =>
    withRollback(async (db) => {
      const { team, anna, bruno, t, event } = await setup(db);
      const coach = await t.userWith([coachOf(team.id)]);
      const url = `/api/callups/events/${event}/attendance`;
      const put = (marks: unknown[]) =>
        t.request(url, { cookie: coach.cookie, method: "PUT", json: { marks } });
      expect((await put([])).status).toBe(400);

      // Anna is not called up yet: marking adds her.
      let res = await put([
        { personId: anna.id, status: "present", markedAt: "2026-11-02T18:05:00Z" },
        { personId: bruno.id, status: "absent", markedAt: "2026-11-02T18:05:00Z" },
      ]);
      expect(res.status).toBe(200);
      // A stale replay (older than the stored mark) changes nothing; a newer one wins.
      await put([{ personId: anna.id, status: "absent", markedAt: "2026-11-02T18:00:00Z" }]);
      res = await put([
        { personId: bruno.id, status: "excused", markedAt: "2026-11-02T18:10:00Z" },
        { personId: bruno.id, status: "present", markedAt: "2026-11-02T18:07:00Z" },
      ]);
      const by = Object.fromEntries(
        (await json<People>(res)).participants.map((p) => [p.personId, p.attendance]),
      );
      expect(by).toEqual({ [anna.id]: "present", [bruno.id]: "excused" });
      // The same queue sent twice is harmless, and a null mark clears.
      await put([{ personId: bruno.id, status: null, markedAt: "2026-11-02T18:20:00Z" }]);
      res = await put([{ personId: bruno.id, status: null, markedAt: "2026-11-02T18:20:00Z" }]);
      expect(
        (await json<People>(res)).participants.find((p) => p.personId === bruno.id)?.attendance,
      ).toBeNull();

      const reader = await t.userWith([{ role: "athlete", teamId: null, classId: null }]);
      expect(
        (await t.request(url, { cookie: reader.cookie, method: "PUT", json: { marks: [] } }))
          .status,
      ).toBe(400);
    }));

  it("reports attendance per person for a team and period", () =>
    withRollback(async (db) => {
      const { team, otherTeam, anna, bruno, t, event, staff } = await setup(db);
      await t.request(`/api/callups/events/${event}/attendance`, {
        cookie: staff.cookie,
        method: "PUT",
        json: {
          marks: [
            { personId: anna.id, status: "present", markedAt: "2026-11-02T18:05:00Z" },
            { personId: bruno.id, status: "absent", markedAt: "2026-11-02T18:05:00Z" },
          ],
        },
      });
      const query = (teamId: string, cookie: string, to = "2026-11-02") =>
        t.request(`/api/callups/stats?teamId=${teamId}&from=2026-11-01&to=${to}`, { cookie });
      const coach = await t.userWith([coachOf(team.id)]);
      const res = await query(team.id, coach.cookie);
      expect(res.status).toBe(200);
      const { stats } = await json<{
        stats: { personId: string; called: number; present: number; rate: number | null }[];
      }>(res);
      expect(stats.find((s) => s.personId === anna.id)).toMatchObject({
        called: 1,
        present: 1,
        rate: 1,
      });
      expect(stats.find((s) => s.personId === bruno.id)).toMatchObject({ present: 0, rate: 0 });
      expect((await query(otherTeam.id, coach.cookie)).status).toBe(403);
      expect((await query(team.id, coach.cookie, "2026-10-01")).status).toBe(400);
      const empty = await json<{ stats: unknown[] }>(
        await query(team.id, staff.cookie, "2026-11-01"),
      );
      expect(empty.stats).toEqual([]);
    }));

  it("lists upcoming call-ups for the person and their guardian", () =>
    withRollback(async (db) => {
      const { team, anna, t, staff, make } = await setup(db);
      const soon = new Date(Date.now() + 86_400_000);
      const res = await t.request("/api/events", {
        cookie: staff.cookie,
        json: {
          kind: "training",
          teamId: team.id,
          startsAt: soon.toISOString(),
          endsAt: new Date(soon.getTime() + 3_600_000).toISOString(),
        },
      });
      const id = (await json<{ events: { id: string }[] }>(res)).events[0]?.id;
      await t.request(`/api/callups/events/${id}`, { cookie: staff.cookie, json: {} });
      const athlete = await t.userWith([], { personId: anna.id });
      const mine = await json<{ callUps: { eventId: string; rsvp: string }[] }>(
        await t.request("/api/callups/mine", { cookie: athlete.cookie }),
      );
      expect(mine.callUps).toMatchObject([{ eventId: id, rsvp: "pending" }]);
      // A guardian sees their ward's call-up, not other children's.
      const parent = await makePerson(db);
      await db
        .insert(guardianships)
        .values({ guardianId: parent.id, childId: anna.id, relationship: "mother" });
      const guardian = await t.userWith([], { personId: parent.id });
      const wards = await json<{ callUps: { personId: string }[] }>(
        await t.request("/api/callups/mine", { cookie: guardian.cookie }),
      );
      expect(wards.callUps.map((c) => c.personId)).toEqual([anna.id]);
      const nobody = await t.userWith([]);
      expect(
        (
          await json<{ callUps: unknown[] }>(
            await t.request("/api/callups/mine", { cookie: nobody.cookie }),
          )
        ).callUps,
      ).toEqual([]);
      expect(make).toBeTruthy();
    }));
});
