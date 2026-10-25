import { HEALTH_DISCIPLINES, type HealthDiscipline, ROLES, type Role } from "@rsc/shared";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, pgCode, savepoint, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { auditLog } from "../audit/schema.js";
import { roleAssignments } from "../auth/schema.js";
import { staffAssignments, teamMembers } from "../teams/schema.js";
import { authorizeHealthRead, loadPrincipal } from "./service.js";

const OWN_DISCIPLINE: Partial<Record<Role, HealthDiscipline>> = {
  doctor: "medical",
  nurse: "medical",
  physio: "physio",
  nutritionist: "nutrition",
  psychologist: "psychology",
};

describeDb("health tier", () => {
  it.each(ROLES.filter((r) => r !== "coach" && r !== "team_manager"))(
    "%s reads health data of its own discipline only, and each read is audited",
    (role) =>
      withRollback(async (db) => {
        const t = testApp(db);
        const athlete = await makePerson(db);
        const { user } = await t.userWith([clubWide(role)]);
        const principal = await loadPrincipal(db, user.id);
        if (!principal) throw new Error("no principal");

        for (const discipline of HEALTH_DISCIPLINES) {
          const allowed = await authorizeHealthRead(db, principal, {
            personId: athlete.id,
            discipline,
          });
          expect(allowed).toBe(OWN_DISCIPLINE[role] === discipline);
        }
        const entries = await db
          .select({ action: auditLog.action, tier: auditLog.tier, details: auditLog.details })
          .from(auditLog)
          .where(eq(auditLog.subjectPersonId, athlete.id));
        const own = OWN_DISCIPLINE[role];
        expect(entries).toEqual(
          own ? [{ action: "health.read", tier: "health", details: { discipline: own } }] : [],
        );
      }),
  );

  it("coaches of the athlete's own team get no health data", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const season = await makeSeason(db);
      const org = await makeOrganisation(db);
      const team = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
      const athlete = await makePerson(db);
      await db
        .insert(teamMembers)
        .values({ teamId: team.id, personId: athlete.id, joinedOn: "2026-07-01" });
      const { user } = await t.userWith([{ role: "coach", teamId: team.id, classId: null }]);
      const principal = await loadPrincipal(db, user.id);
      if (!principal) throw new Error("no principal");
      for (const discipline of HEALTH_DISCIPLINES) {
        expect(await authorizeHealthRead(db, principal, { personId: athlete.id, discipline })).toBe(
          false,
        );
      }
    }));
});

describeDb("roles and team assignments (ADR 0027)", () => {
  it("holds a role once per user, with no team on it", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user } = await t.userWith([]);
      const insert = (role: "coach" | "admin") =>
        savepoint(db, (tx) => tx.insert(roleAssignments).values({ userId: user.id, role }));
      expect(await insert("coach")).toBeUndefined();
      expect(pgCode(await insert("coach"))).toBe("23505");
      expect(await insert("admin")).toBeUndefined();
    }));

  it("gives a coach every team they are assigned to, and nothing without an assignment", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const season = await makeSeason(db);
      const org = await makeOrganisation(db);
      const a = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
      const b = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
      const person = await makePerson(db);
      const { user } = await t.userWith([clubWide("coach")], { personId: person.id });

      // The role alone reaches no team.
      expect((await loadPrincipal(db, user.id))?.grants).toEqual([]);

      for (const team of [a, b]) {
        await db.insert(staffAssignments).values({
          personId: person.id,
          seasonId: season.id,
          organisationId: org.id,
          function: "assistant_coach",
          teamId: team.id,
        });
      }
      const grants = (await loadPrincipal(db, user.id))?.grants ?? [];
      expect(grants.map((g) => [g.role, g.teamId]).sort()).toEqual(
        [
          ["coach", a.id],
          ["coach", b.id],
        ].sort(),
      );

      // A delegado function does not make a coach, and an ended assignment stops counting.
      await db.insert(staffAssignments).values({
        personId: person.id,
        seasonId: season.id,
        organisationId: org.id,
        function: "team_manager",
        teamId: a.id,
        endsOn: "2020-01-01",
      });
      expect((await loadPrincipal(db, user.id))?.grants).toHaveLength(2);
    }));

  it("needs the role: an assignment alone gives no access", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const season = await makeSeason(db);
      const org = await makeOrganisation(db);
      const team = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
      const person = await makePerson(db);
      await db.insert(staffAssignments).values({
        personId: person.id,
        seasonId: season.id,
        organisationId: org.id,
        function: "head_coach",
        teamId: team.id,
      });
      const { user } = await t.userWith([], { personId: person.id });
      expect((await loadPrincipal(db, user.id))?.grants).toEqual([]);
    }));
});
