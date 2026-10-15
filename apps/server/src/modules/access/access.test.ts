import { HEALTH_DISCIPLINES, type HealthDiscipline, ROLES, type Role } from "@rsp/shared";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, pgCode, savepoint, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { auditLog } from "../audit/schema.js";
import { roleAssignments } from "../auth/schema.js";
import { teamMembers } from "../teams/schema.js";
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

describeDb("role_assignments constraints", () => {
  it("requires one team or class for scoped roles and none for club-wide roles", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const season = await makeSeason(db);
      const org = await makeOrganisation(db);
      const team = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
      const { user } = await t.userWith([]);
      const insert = (values: Partial<typeof roleAssignments.$inferInsert>) =>
        savepoint(db, (tx) =>
          tx.insert(roleAssignments).values({ userId: user.id, role: "coach", ...values }),
        );
      expect(pgCode(await insert({}))).toBe("23514");
      expect(pgCode(await insert({ role: "admin", teamId: team.id }))).toBe("23514");
      expect(await insert({ teamId: team.id })).toBeUndefined();
      expect(pgCode(await insert({ teamId: team.id }))).toBe("23505");
      expect(await insert({ role: "admin" })).toBeUndefined();
      expect(pgCode(await insert({ role: "admin" }))).toBe("23505");
    }));
});
