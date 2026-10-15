import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import {
  makeAgeGroup,
  makeClass,
  makeOrganisation,
  makePerson,
  makeSeason,
  makeTeam,
} from "../../test/factories.js";

async function setup(db: Db) {
  const season = await makeSeason(db);
  const org = await makeOrganisation(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [t1, t2] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const c1 = await makeClass(db, refs);
  return { season, org, refs, t1, t2, c1, t: testApp(db) };
}

describeDb("teams API", () => {
  it("creates, renames and fills a team; only admin and staff may write", () =>
    withRollback(async (db) => {
      const { season, org, t } = await setup(db);
      const group = await makeAgeGroup(db, season.id);
      const staff = await t.userWith([clubWide("staff")]);
      const create = await t.request("/api/teams", {
        cookie: staff.cookie,
        json: {
          seasonId: season.id,
          organisationId: org.id,
          ageGroupId: group.id,
          name: "Sub-13 A",
          category: "male",
        },
      });
      expect(create.status).toBe(201);
      const { team } = (await create.json()) as { team: { id: string } };
      const dup = await t.request("/api/teams", {
        cookie: staff.cookie,
        json: { seasonId: season.id, organisationId: org.id, name: "Sub-13 A", category: "male" },
      });
      expect(dup.status).toBe(409);

      const rename = await t.request(`/api/teams/${team.id}`, {
        method: "PATCH",
        cookie: staff.cookie,
        json: { name: "Sub-13 B" },
      });
      expect(((await rename.json()) as { team: { name: string } }).team.name).toBe("Sub-13 B");

      const player = await makePerson(db, { email: "p@example.test" });
      const join = (cookie: string) =>
        t.request(`/api/teams/${team.id}/members`, {
          cookie,
          json: { personId: player.id, joinedOn: "2026-07-01", shirtNumber: 7 },
        });
      const doctor = await t.userWith([clubWide("doctor")]);
      expect((await join(doctor.cookie)).status).toBe(403);
      expect((await join(staff.cookie)).status).toBe(201);

      const detail = await t.request(`/api/teams/${team.id}`, { cookie: doctor.cookie });
      const body = (await detail.json()) as { roster: Record<string, unknown>[] };
      expect(body.roster).toMatchObject([{ personId: player.id, shirtNumber: 7 }]);
      expect(body.roster[0]).not.toHaveProperty("email");

      const leave = await t.request(`/api/teams/${team.id}/members/${player.id}/leave`, {
        cookie: staff.cookie,
        json: { leftOn: "2026-12-01" },
      });
      expect(leave.status).toBe(204);
      const after = await t.request(`/api/teams/${team.id}`, { cookie: staff.cookie });
      expect(((await after.json()) as { roster: unknown[] }).roster).toEqual([]);
      // Rejoining reopens the place.
      expect((await join(staff.cookie)).status).toBe(201);
    }));

  it("a coach sees only their own team", () =>
    withRollback(async (db) => {
      const { t1, t2, t } = await setup(db);
      const coach = await t.userWith([{ role: "coach", teamId: t1.id, classId: null }]);
      const list = await t.request("/api/teams", { cookie: coach.cookie });
      const { teams } = (await list.json()) as { teams: { id: string }[] };
      expect(teams.map((x) => x.id)).toEqual([t1.id]);
      expect((await t.request(`/api/teams/${t1.id}`, { cookie: coach.cookie })).status).toBe(200);
      expect((await t.request(`/api/teams/${t2.id}`, { cookie: coach.cookie })).status).toBe(403);
      const write = await t.request(`/api/teams/${t1.id}`, {
        method: "PATCH",
        cookie: coach.cookie,
        json: { name: "X" },
      });
      expect(write.status).toBe(403);
    }));

  it("refuses roles without teams.read and anonymous callers", () =>
    withRollback(async (db) => {
      const { t1, t } = await setup(db);
      const guardian = await t.userWith([clubWide("guardian")]);
      expect((await t.request("/api/teams", { cookie: guardian.cookie })).status).toBe(403);
      expect((await t.request(`/api/teams/${t1.id}`, { cookie: guardian.cookie })).status).toBe(
        403,
      );
      expect((await t.request("/api/teams")).status).toBe(401);
    }));

  it("assigns staff to a team and shows them on it", () =>
    withRollback(async (db) => {
      const { season, org, t1, t } = await setup(db);
      const coachPerson = await makePerson(db);
      const admin = await t.userWith([clubWide("admin")]);
      const res = await t.request("/api/staff-assignments", {
        cookie: admin.cookie,
        json: {
          personId: coachPerson.id,
          seasonId: season.id,
          organisationId: org.id,
          function: "head_coach",
          teamId: t1.id,
        },
      });
      expect(res.status).toBe(201);
      const { assignment } = (await res.json()) as { assignment: { id: string } };
      const both = await t.request("/api/staff-assignments", {
        cookie: admin.cookie,
        json: {
          personId: coachPerson.id,
          seasonId: season.id,
          organisationId: org.id,
          function: "assistant_coach",
          teamId: t1.id,
          classId: crypto.randomUUID(),
        },
      });
      expect(both.status).toBe(400);
      const detail = await t.request(`/api/teams/${t1.id}`, { cookie: admin.cookie });
      expect(((await detail.json()) as { staff: unknown[] }).staff).toMatchObject([
        { personId: coachPerson.id, function: "head_coach" },
      ]);
      const treasurer = await t.userWith([clubWide("treasurer")]);
      const denied = await t.request(`/api/staff-assignments/${assignment.id}`, {
        method: "DELETE",
        cookie: treasurer.cookie,
      });
      expect(denied.status).toBe(403);
      const ok = await t.request(`/api/staff-assignments/${assignment.id}`, {
        method: "DELETE",
        cookie: admin.cookie,
      });
      expect(ok.status).toBe(204);
    }));
});

describeDb("classes API and lookups", () => {
  it("enrols and removes athletes in a class; a class coach reads their class", () =>
    withRollback(async (db) => {
      const { c1, t } = await setup(db);
      const kid = await makePerson(db);
      const staff = await t.userWith([clubWide("staff")]);
      const enrol = await t.request(`/api/classes/${c1.id}/members`, {
        cookie: staff.cookie,
        json: { personId: kid.id, joinedOn: "2026-09-15" },
      });
      expect(enrol.status).toBe(201);
      const coach = await t.userWith([{ role: "coach", classId: c1.id, teamId: null }]);
      const read = await t.request(`/api/classes/${c1.id}`, { cookie: coach.cookie });
      expect(((await read.json()) as { roster: unknown[] }).roster).toHaveLength(1);
      const leave = await t.request(`/api/classes/${c1.id}/members/${kid.id}/leave`, {
        cookie: staff.cookie,
        json: { leftOn: "2026-10-01" },
      });
      expect(leave.status).toBe(204);
      const denied = await t.request(`/api/classes/${c1.id}/members`, {
        cookie: coach.cookie,
        json: { personId: kid.id, joinedOn: "2026-10-02" },
      });
      expect(denied.status).toBe(403);
    }));

  it("serves seasons and organisations to readers and refuses others", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      for (const path of ["/api/lookups/seasons", "/api/lookups/organisations"]) {
        expect((await t.request(path, { cookie: staff.cookie })).status).toBe(200);
      }
      const member = await t.userWith([clubWide("member")]);
      expect((await t.request("/api/lookups/seasons", { cookie: member.cookie })).status).toBe(403);
    }));
});
