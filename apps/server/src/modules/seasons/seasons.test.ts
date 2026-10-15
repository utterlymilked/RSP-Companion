import { expect, it } from "vitest";
import { describeDb, pgCode, savepoint, withRollback } from "../../test/db.js";
import { makeAgeGroup, makeSeason } from "../../test/factories.js";
import { seasons } from "./schema.js";
import { ageGroupsForBirthYear, getCurrentSeason, setCurrentSeason } from "./service.js";

describeDb("seasons", () => {
  it("switches the current season", () =>
    withRollback(async (db) => {
      const a = await makeSeason(db, {
        name: "2025/26",
        startsOn: "2025-07-01",
        endsOn: "2026-06-30",
      });
      const b = await makeSeason(db, { name: "2026/27" });
      await setCurrentSeason(db, a.id);
      expect((await getCurrentSeason(db))?.id).toBe(a.id);
      await setCurrentSeason(db, b.id);
      expect((await getCurrentSeason(db))?.id).toBe(b.id);
    }));

  it("allows at most one current season and valid dates", () =>
    withRollback(async (db) => {
      await makeSeason(db, { isCurrent: true });
      const twoCurrent = await savepoint(db, (tx) => makeSeason(tx, { isCurrent: true }));
      expect(pgCode(twoCurrent)).toBe("23505");
      const backwards = await savepoint(db, (tx) =>
        tx.insert(seasons).values({ name: "x", startsOn: "2027-01-01", endsOn: "2026-01-01" }),
      );
      expect(pgCode(backwards)).toBe("23514");
    }));

  it("finds the escalões for a birth year, by sex", () =>
    withRollback(async (db) => {
      const s = await makeSeason(db);
      const boys = await makeAgeGroup(db, s.id, {
        name: "Sub-13",
        category: "male",
        birthYearFrom: 2014,
        birthYearTo: 2015,
      });
      const girls = await makeAgeGroup(db, s.id, {
        name: "Sub-14",
        category: "female",
        birthYearFrom: 2013,
        birthYearTo: 2015,
      });
      const mixed = await makeAgeGroup(db, s.id, {
        name: "Petizes",
        category: "mixed",
        birthYearFrom: 2015,
        birthYearTo: 2020,
        sortOrder: -1,
      });
      const ids = async (year: number, sex?: "female" | "male") =>
        (await ageGroupsForBirthYear(db, s.id, year, sex)).map((g) => g.id);
      expect(await ids(2015, "male")).toEqual([mixed.id, boys.id]);
      expect(await ids(2015, "female")).toEqual([mixed.id, girls.id]);
      expect(await ids(2015)).toEqual([mixed.id]);
      expect(await ids(2010, "male")).toEqual([]);

      const badRange = await savepoint(db, (tx) =>
        makeAgeGroup(tx, s.id, { birthYearFrom: 2016, birthYearTo: 2015 }),
      );
      expect(pgCode(badRange)).toBe("23514");
    }));
});
