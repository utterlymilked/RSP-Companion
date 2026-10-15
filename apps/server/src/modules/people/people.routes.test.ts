import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import {
  makeClass,
  makeOrganisation,
  makePerson,
  makeSeason,
  makeTeam,
} from "../../test/factories.js";
import { auditLog } from "../audit/schema.js";
import { classMembers, teamMembers } from "../teams/schema.js";
import { guardianships } from "./schema.js";

/**
 * Athlete A plays in team T1 and class C1 and has guardian G; athlete B plays in team T2.
 * Each case signs in a user with one role and reads A's record.
 */
async function setup(db: Db) {
  const season = await makeSeason(db);
  const org = await makeOrganisation(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [t1, t2, c1] = [
    await makeTeam(db, refs),
    await makeTeam(db, refs),
    await makeClass(db, refs),
  ];
  const a = await makePerson(db, {
    birthDate: "2014-03-02",
    email: "a@example.test",
    phone: "+351 900 000 001",
  });
  const b = await makePerson(db);
  const g = await makePerson(db);
  await db.insert(teamMembers).values([
    { teamId: t1.id, personId: a.id, joinedOn: "2026-07-01" },
    { teamId: t2.id, personId: b.id, joinedOn: "2026-07-01" },
  ]);
  await db.insert(classMembers).values({ classId: c1.id, personId: a.id, joinedOn: "2026-07-01" });
  await db
    .insert(guardianships)
    .values({ guardianId: g.id, childId: a.id, relationship: "mother" });
  return { t1, t2, c1, a, b, g, t: testApp(db) };
}

const PERSONAL_KEYS = ["birthDate", "email", "phone", "federationId"];

async function readPerson(
  t: ReturnType<typeof testApp>,
  cookie: string | undefined,
  personId: string,
) {
  const res = await t.request(`/api/people/${personId}`, { cookie });
  const body = (await res.json()) as { tier?: string; person?: Record<string, unknown> };
  return { status: res.status, tier: body.tier, person: body.person };
}

describeDb("GET /api/people/:id tiers", () => {
  it.each([
    ["admin", "personal"],
    ["staff", "personal"],
    ["treasurer", "personal"],
    ["doctor", "personal"],
    ["psychologist", "personal"],
    ["sociologist", "personal"],
    ["stores", "general"],
    ["scout", "general"],
    ["recruiter", "general"],
  ] as const)("club-wide %s reads the %s tier", (role, tier) =>
    withRollback(async (db) => {
      const { t, a } = await setup(db);
      const { cookie } = await t.userWith([clubWide(role)]);
      const result = await readPerson(t, cookie, a.id);
      expect(result.status).toBe(200);
      expect(result.tier).toBe(tier);
      expect(result.person?.fullName).toBe(a.fullName);
      for (const key of PERSONAL_KEYS) {
        expect(key in (result.person ?? {})).toBe(tier === "personal");
      }
    }),
  );

  it.each(["athlete", "guardian", "member"] as const)(
    "a %s with no link to the person is refused",
    (role) =>
      withRollback(async (db) => {
        const { t, a } = await setup(db);
        const { cookie } = await t.userWith([clubWide(role)]);
        expect((await readPerson(t, cookie, a.id)).status).toBe(403);
      }),
  );

  it("a coach reads athletes of their team or class only", () =>
    withRollback(async (db) => {
      const { t, a, b, t1, c1 } = await setup(db);
      const teamCoach = await t.userWith([{ role: "coach", teamId: t1.id, classId: null }]);
      expect(await readPerson(t, teamCoach.cookie, a.id)).toMatchObject({
        status: 200,
        tier: "personal",
      });
      expect((await readPerson(t, teamCoach.cookie, b.id)).status).toBe(403);

      const classCoach = await t.userWith([{ role: "coach", teamId: null, classId: c1.id }]);
      expect((await readPerson(t, classCoach.cookie, a.id)).status).toBe(200);
      expect((await readPerson(t, classCoach.cookie, b.id)).status).toBe(403);
    }));

  it("a team manager of another team is refused, and leaving the team ends access", () =>
    withRollback(async (db) => {
      const { t, a, t1, t2 } = await setup(db);
      const other = await t.userWith([{ role: "team_manager", teamId: t2.id, classId: null }]);
      expect((await readPerson(t, other.cookie, a.id)).status).toBe(403);

      const own = await t.userWith([{ role: "team_manager", teamId: t1.id, classId: null }]);
      expect((await readPerson(t, own.cookie, a.id)).status).toBe(200);
      await db
        .update(teamMembers)
        .set({ leftOn: "2026-12-31" })
        .where(and(eq(teamMembers.teamId, t1.id), eq(teamMembers.personId, a.id)));
      expect((await readPerson(t, own.cookie, a.id)).status).toBe(403);
    }));

  it("a guardian reads their ward and an athlete reads themself, without audit", () =>
    withRollback(async (db) => {
      const { t, a, b, g } = await setup(db);
      const guardian = await t.userWith([clubWide("guardian")], { personId: g.id });
      expect(await readPerson(t, guardian.cookie, a.id)).toMatchObject({ tier: "personal" });
      expect((await readPerson(t, guardian.cookie, b.id)).status).toBe(403);

      const athlete = await t.userWith([], { personId: a.id });
      expect(await readPerson(t, athlete.cookie, a.id)).toMatchObject({ tier: "personal" });
      expect((await readPerson(t, athlete.cookie, b.id)).status).toBe(403);

      const entries = await db.select().from(auditLog).where(eq(auditLog.subjectPersonId, a.id));
      expect(entries).toEqual([]);
    }));

  it("audits personal-tier reads by staff, not general-tier reads", () =>
    withRollback(async (db) => {
      const { t, a } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      const stores = await t.userWith([clubWide("stores")]);
      await readPerson(t, staff.cookie, a.id);
      await readPerson(t, stores.cookie, a.id);
      const entries = await db
        .select({ actor: auditLog.actorUserId, action: auditLog.action, tier: auditLog.tier })
        .from(auditLog)
        .where(eq(auditLog.subjectPersonId, a.id));
      expect(entries).toEqual([
        { actor: staff.user.id, action: "person.read_personal", tier: "personal" },
      ]);
    }));

  it("requires a session, and returns 404 for an unknown person", () =>
    withRollback(async (db) => {
      const { t, a } = await setup(db);
      expect((await readPerson(t, undefined, a.id)).status).toBe(401);
      const admin = await t.userWith([clubWide("admin")]);
      const unknown = "6f1c7a52-8e57-4d1b-9a43-2f8e2a3b9c10";
      expect((await readPerson(t, admin.cookie, unknown)).status).toBe(404);
      expect((await t.request("/api/people/not-a-uuid", { cookie: admin.cookie })).status).toBe(
        400,
      );
    }));
});
