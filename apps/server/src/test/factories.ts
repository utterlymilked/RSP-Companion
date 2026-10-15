import type { Db } from "../db/index.js";
import {
  departments,
  type NewOrganisation,
  organisations,
} from "../modules/organisations/schema.js";
import { type NewPerson, persons } from "../modules/people/schema.js";
import { ageGroups, type NewAgeGroup, type NewSeason, seasons } from "../modules/seasons/schema.js";
import { classes, type NewTeam, type NewTrainingClass, teams } from "../modules/teams/schema.js";

// Minimal valid rows for tests. Each helper takes overrides and returns the inserted row.
// Names get a counter so unique constraints never clash between tests.

let counter = 0;
const next = () => ++counter;

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export const makeOrganisation = (db: Db, o: Partial<NewOrganisation> = {}) =>
  one(
    db
      .insert(organisations)
      .values({ name: `Org ${next()}`, kind: "club", ...o })
      .returning(),
  );

export const makeDepartment = (db: Db, organisationId: string, name = `Gabinete ${next()}`) =>
  one(db.insert(departments).values({ organisationId, name }).returning());

export const makePerson = (db: Db, p: Partial<NewPerson> = {}) =>
  one(
    db
      .insert(persons)
      .values({ fullName: `Pessoa Teste ${next()}`, ...p })
      .returning(),
  );

export const makeSeason = (db: Db, s: Partial<NewSeason> = {}) => {
  const n = next();
  return one(
    db
      .insert(seasons)
      .values({ name: `Época ${n}`, startsOn: "2026-07-01", endsOn: "2027-06-30", ...s })
      .returning(),
  );
};

export const makeAgeGroup = (db: Db, seasonId: string, a: Partial<NewAgeGroup> = {}) =>
  one(
    db
      .insert(ageGroups)
      .values({
        seasonId,
        name: `Sub-${next()}`,
        category: "mixed",
        birthYearFrom: 2016,
        birthYearTo: 2017,
        ...a,
      })
      .returning(),
  );

export const makeClass = (
  db: Db,
  refs: { seasonId: string; organisationId: string },
  c: Partial<NewTrainingClass> = {},
) =>
  one(
    db
      .insert(classes)
      .values({ code: `${next()}`, ...refs, ...c })
      .returning(),
  );

export const makeTeam = (
  db: Db,
  refs: { seasonId: string; organisationId: string },
  t: Partial<NewTeam> = {},
) =>
  one(
    db
      .insert(teams)
      .values({ name: `Equipa ${next()}`, category: "male", ...refs, ...t })
      .returning(),
  );
