import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { describeDb, pgCode, savepoint, withRollback } from "../../test/db.js";
import {
  makeAgeGroup,
  makeClass,
  makeOrganisation,
  makePerson,
  makeSeason,
  makeTeam,
} from "../../test/factories.js";
import {
  classAgeGroups,
  classes,
  classSchedules,
  staffAssignments,
  teamMembers,
} from "./schema.js";
import { classRoster, enrolInClass, leaveClass, teamStaff } from "./service.js";

async function setup(db: Db) {
  const season = await makeSeason(db);
  const org = await makeOrganisation(db, { kind: "football_school" });
  const refs = { seasonId: season.id, organisationId: org.id };
  return { season, org, refs };
}

describeDb("classes and teams", () => {
  it("links a class to several escalões and loads them with its schedule", () =>
    withRollback(async (db) => {
      const { season, refs } = await setup(db);
      const sub6 = await makeAgeGroup(db, season.id, { name: "Sub-6" });
      const sub8 = await makeAgeGroup(db, season.id, { name: "Sub-8" });
      const turma = await makeClass(db, refs, { code: "61/81", monthlyFeeCents: 3750 });
      await db.insert(classAgeGroups).values([
        { classId: turma.id, ageGroupId: sub6.id },
        { classId: turma.id, ageGroupId: sub8.id },
      ]);
      await db
        .insert(classSchedules)
        .values({ classId: turma.id, weekday: 2, startsAt: "18:00", endsAt: "19:00" });
      const found = await db.query.classes.findFirst({
        where: eq(classes.id, turma.id),
        with: { ageGroups: { with: { ageGroup: true } }, schedules: true },
      });
      expect(found?.ageGroups.map((g) => g.ageGroup.name).sort()).toEqual(["Sub-6", "Sub-8"]);
      expect(found?.schedules[0]).toMatchObject({ weekday: 2, startsAt: "18:00:00" });
      expect(found?.monthlyFeeCents).toBe(3750);
    }));

  it("rejects invalid schedules, fees and duplicate class codes", () =>
    withRollback(async (db) => {
      const { refs } = await setup(db);
      const turma = await makeClass(db, refs, { code: "11" });
      const slot = { classId: turma.id, startsAt: "18:00", endsAt: "19:00" };
      expect(
        pgCode(
          await savepoint(db, (tx) => tx.insert(classSchedules).values({ ...slot, weekday: 8 })),
        ),
      ).toBe("23514");
      expect(
        pgCode(
          await savepoint(db, (tx) =>
            tx.insert(classSchedules).values({ ...slot, weekday: 1, endsAt: "17:00" }),
          ),
        ),
      ).toBe("23514");
      expect(
        pgCode(await savepoint(db, (tx) => makeClass(tx, refs, { monthlyFeeCents: -1 }))),
      ).toBe("23514");
      expect(pgCode(await savepoint(db, (tx) => makeClass(tx, refs, { code: "11" })))).toBe(
        "23505",
      );
    }));

  it("enrols, removes and re-enrols athletes in a class", () =>
    withRollback(async (db) => {
      const { refs } = await setup(db);
      const turma = await makeClass(db, refs);
      const ana = await makePerson(db, { fullName: "Ana" });
      const rui = await makePerson(db, { fullName: "Rui" });
      await enrolInClass(db, { classId: turma.id, personId: rui.id, joinedOn: "2026-09-01" });
      await enrolInClass(db, { classId: turma.id, personId: ana.id, joinedOn: "2026-09-01" });
      expect((await classRoster(db, turma.id)).map((r) => r.fullName)).toEqual(["Ana", "Rui"]);

      expect(
        await leaveClass(db, { classId: turma.id, personId: rui.id, leftOn: "2026-12-01" }),
      ).toBe(true);
      expect(
        await leaveClass(db, { classId: turma.id, personId: rui.id, leftOn: "2026-12-02" }),
      ).toBe(false);
      expect((await classRoster(db, turma.id)).map((r) => r.fullName)).toEqual(["Ana"]);

      const back = await enrolInClass(db, {
        classId: turma.id,
        personId: rui.id,
        joinedOn: "2027-01-10",
      });
      expect(back).toMatchObject({ leftOn: null, joinedOn: "2027-01-10" });
      expect(await classRoster(db, turma.id)).toHaveLength(2);
    }));

  it("lists team staff and limits an assignment to one team or class", () =>
    withRollback(async (db) => {
      const { season, org, refs } = await setup(db);
      const team = await makeTeam(db, refs, { name: "Sub-13 A" });
      const turma = await makeClass(db, refs);
      const coach = await makePerson(db, { fullName: "Treinador" });
      const delegate = await makePerson(db, { fullName: "Delegado" });
      const base = { seasonId: season.id, organisationId: org.id };
      await db.insert(staffAssignments).values([
        { ...base, personId: coach.id, function: "head_coach", teamId: team.id },
        { ...base, personId: delegate.id, function: "team_manager", teamId: team.id },
        { ...base, personId: coach.id, function: "head_coach", classId: turma.id },
      ]);
      expect(await teamStaff(db, team.id)).toEqual([
        { personId: coach.id, fullName: "Treinador", function: "head_coach" },
        { personId: delegate.id, fullName: "Delegado", function: "team_manager" },
      ]);

      const both = await savepoint(db, (tx) =>
        tx.insert(staffAssignments).values({
          ...base,
          personId: coach.id,
          function: "assistant_coach",
          teamId: team.id,
          classId: turma.id,
        }),
      );
      expect(pgCode(both)).toBe("23514");
    }));

  it("validates team rosters", () =>
    withRollback(async (db) => {
      const { refs } = await setup(db);
      const team = await makeTeam(db, refs);
      const p = await makePerson(db);
      const row = { teamId: team.id, personId: p.id, joinedOn: "2026-09-01" };
      expect(
        pgCode(
          await savepoint(db, (tx) => tx.insert(teamMembers).values({ ...row, shirtNumber: 100 })),
        ),
      ).toBe("23514");
      await db.insert(teamMembers).values({ ...row, shirtNumber: 10 });
      expect(pgCode(await savepoint(db, (tx) => tx.insert(teamMembers).values(row)))).toBe("23505");
    }));
});
