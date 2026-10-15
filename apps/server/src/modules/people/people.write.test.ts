import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { teamMembers } from "../teams/schema.js";

async function setup(db: Db) {
  const season = await makeSeason(db);
  const org = await makeOrganisation(db);
  const team = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
  const other = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
  const t = testApp(db);
  return { org, team, other, t };
}

describeDb("people lists and search", () => {
  it("searches by name, ignoring case and treating % literally", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      await makePerson(db, { fullName: "Ana Luísa Ferreira" });
      await makePerson(db, { fullName: "Bruno 100%" });
      const { cookie } = await t.userWith([clubWide("staff")]);
      const names = async (q: string) => {
        const res = await t.request(`/api/people?q=${encodeURIComponent(q)}`, { cookie });
        expect(res.status).toBe(200);
        return ((await res.json()) as { people: { fullName: string }[] }).people.map(
          (p) => p.fullName,
        );
      };
      expect(await names("luísa")).toEqual(["Ana Luísa Ferreira"]);
      expect(await names("%")).toEqual(["Bruno 100%"]);
    }));

  it("lists the general tier only, whatever the role", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      await makePerson(db, { email: "x@example.test", birthDate: "2014-01-01" });
      const { cookie } = await t.userWith([clubWide("admin")]);
      const res = await t.request("/api/people", { cookie });
      const { people } = (await res.json()) as { people: Record<string, unknown>[] };
      expect(people.length).toBeGreaterThan(0);
      for (const p of people) {
        expect(p).not.toHaveProperty("email");
        expect(p).not.toHaveProperty("birthDate");
      }
    }));

  it("filters by team and limits a coach to their own team", () =>
    withRollback(async (db) => {
      const { t, team, other } = await setup(db);
      const mine = await makePerson(db);
      const theirs = await makePerson(db);
      await db.insert(teamMembers).values([
        { teamId: team.id, personId: mine.id, joinedOn: "2026-07-01" },
        { teamId: other.id, personId: theirs.id, joinedOn: "2026-07-01" },
      ]);
      const coach = await t.userWith([{ role: "coach", teamId: team.id, classId: null }]);
      const res = await t.request("/api/people", { cookie: coach.cookie });
      const { people } = (await res.json()) as { people: { id: string }[] };
      expect(people.map((p) => p.id)).toEqual([mine.id]);

      const admin = await t.userWith([clubWide("admin")]);
      const filtered = await t.request(`/api/people?teamId=${other.id}`, { cookie: admin.cookie });
      const body = (await filtered.json()) as { people: { id: string }[] };
      expect(body.people.map((p) => p.id)).toEqual([theirs.id]);
    }));

  it("refuses roles without people.read and anonymous callers", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      const athlete = await t.userWith([clubWide("athlete")]);
      expect((await t.request("/api/people", { cookie: athlete.cookie })).status).toBe(403);
      expect((await t.request("/api/people")).status).toBe(401);
    }));
});

describeDb("people writes", () => {
  const body = { fullName: "  Carlos Silva ", email: "Carlos@Example.test", sex: "male" };

  it("admin and staff create and update; others are refused", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      for (const role of ["admin", "staff"] as const) {
        const { cookie } = await t.userWith([clubWide(role)]);
        const res = await t.request("/api/people", {
          cookie,
          json: { ...body, federationId: `FPF-${role}` },
        });
        expect(res.status).toBe(201);
        const { person } = (await res.json()) as { person: Record<string, string> };
        expect(person).toMatchObject({ fullName: "Carlos Silva", email: "carlos@example.test" });
        const patch = await t.request(`/api/people/${person.id}`, {
          method: "PATCH",
          cookie,
          json: { phone: "+351 900 000 000" },
        });
        expect(patch.status).toBe(200);
      }
      for (const role of ["treasurer", "coach", "stores", "doctor", "athlete"] as const) {
        const roles =
          role === "coach"
            ? [{ role, teamId: (await makeTeam(db, await refs(db))).id, classId: null }]
            : [clubWide(role)];
        const { cookie } = await t.userWith(roles);
        expect((await t.request("/api/people", { cookie, json: body })).status).toBe(403);
      }
    }));

  it("rejects invalid input and duplicate federation ids", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      const { cookie } = await t.userWith([clubWide("staff")]);
      expect((await t.request("/api/people", { cookie, json: { fullName: "" } })).status).toBe(400);
      const first = await t.request("/api/people", {
        cookie,
        json: { fullName: "A", federationId: "123" },
      });
      expect(first.status).toBe(201);
      const dup = await t.request("/api/people", {
        cookie,
        json: { fullName: "B", federationId: "123" },
      });
      expect(dup.status).toBe(409);
      // The failed insert must not break later requests.
      expect((await t.request("/api/people", { cookie })).status).toBe(200);
    }));

  it("patching an unknown person is a 404", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      const { cookie } = await t.userWith([clubWide("admin")]);
      const res = await t.request(`/api/people/${crypto.randomUUID()}`, {
        method: "PATCH",
        cookie,
        json: { fullName: "X" },
      });
      expect(res.status).toBe(404);
    }));
});

async function refs(db: Db) {
  return { seasonId: (await makeSeason(db)).id, organisationId: (await makeOrganisation(db)).id };
}

describeDb("guardians and memberships over the API", () => {
  it("links guardians, moves the primary flag and shows contacts by tier", () =>
    withRollback(async (db) => {
      const { t, team } = await setup(db);
      const child = await makePerson(db, { birthDate: "2015-05-05" });
      const mum = await makePerson(db, { email: "mum@example.test" });
      const dad = await makePerson(db);
      await db
        .insert(teamMembers)
        .values({ teamId: team.id, personId: child.id, joinedOn: "2026-07-01" });
      const staff = await t.userWith([clubWide("staff")]);
      const add = (guardianId: string, relationship: string) =>
        t.request(`/api/people/${child.id}/guardians`, {
          cookie: staff.cookie,
          json: { guardianId, relationship, isPrimary: true },
        });
      expect((await add(mum.id, "mother")).status).toBe(201);
      expect((await add(dad.id, "father")).status).toBe(201);
      expect((await add(dad.id, "father")).status).toBe(409);
      const self = await t.request(`/api/people/${child.id}/guardians`, {
        cookie: staff.cookie,
        json: { guardianId: child.id, relationship: "other" },
      });
      expect(self.status).toBe(400);

      type G = { isPrimary: boolean; guardian: Record<string, unknown> };
      const read = async (cookie: string) => {
        const res = await t.request(`/api/people/${child.id}/guardians`, { cookie });
        return { status: res.status, ...((await res.json()) as { tier: string; guardians: G[] }) };
      };
      const asStaff = await read(staff.cookie);
      expect(asStaff.guardians.map((g) => g.isPrimary)).toEqual([true, false]);
      expect(asStaff.guardians.some((g) => g.guardian.email === "mum@example.test")).toBe(true);

      const scout = await t.userWith([clubWide("scout")]);
      const asScout = await read(scout.cookie);
      expect(asScout.tier).toBe("general");
      expect(asScout.guardians.some((g) => "email" in g.guardian)).toBe(false);
      const coach = await t.userWith([{ role: "coach", teamId: team.id, classId: null }]);
      expect((await read(coach.cookie)).tier).toBe("personal");

      const gone = await t.request(`/api/people/${child.id}/guardians/${mum.id}`, {
        method: "DELETE",
        cookie: staff.cookie,
      });
      expect(gone.status).toBe(204);
      const again = await t.request(`/api/people/${child.id}/guardians/${mum.id}`, {
        method: "DELETE",
        cookie: staff.cookie,
      });
      expect(again.status).toBe(404);
    }));

  it("creates memberships with unique member numbers; reading needs the personal tier", () =>
    withRollback(async (db) => {
      const { t, org } = await setup(db);
      const a = await makePerson(db);
      const b = await makePerson(db);
      const staff = await t.userWith([clubWide("staff")]);
      const create = (personId: string, memberNumber: string) =>
        t.request(`/api/people/${personId}/memberships`, {
          cookie: staff.cookie,
          json: { organisationId: org.id, memberNumber, startedOn: "2026-07-01" },
        });
      const first = await create(a.id, "100");
      expect(first.status).toBe(201);
      expect((await create(b.id, "100")).status).toBe(409);
      const { membership } = (await first.json()) as { membership: { id: string } };
      const end = await t.request(`/api/people/${a.id}/memberships/${membership.id}`, {
        method: "PATCH",
        cookie: staff.cookie,
        json: { status: "ended", endedOn: "2027-06-30" },
      });
      expect(end.status).toBe(200);

      const list = await t.request(`/api/people/${a.id}/memberships`, { cookie: staff.cookie });
      expect(((await list.json()) as { memberships: unknown[] }).memberships).toHaveLength(1);
      const scout = await t.userWith([clubWide("scout")]);
      const denied = await t.request(`/api/people/${a.id}/memberships`, { cookie: scout.cookie });
      expect(denied.status).toBe(403);
    }));
});
