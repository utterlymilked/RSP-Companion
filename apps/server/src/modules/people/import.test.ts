import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { describeDb, withRollback } from "../../test/db.js";
import { makeClass, makeOrganisation, makeSeason, makeTeam } from "../../test/factories.js";
import { classMembers, teamMembers } from "../teams/schema.js";
import { importRows, normalizeHeader, parseCsv, parseDate, parseImport } from "./import.js";
import { guardianships, memberships, persons } from "./schema.js";

// All data below is invented.

describe("parseCsv", () => {
  it("handles quotes, CRLF, BOM and semicolons", () => {
    const text = '﻿Nome;Notas\r\n"Rui ""Rô"" Costa";"a;b"\r\n\r\nInês;x\r\n';
    expect(parseCsv(text)).toEqual([
      ["Nome", "Notas"],
      ['Rui "Rô" Costa', "a;b"],
      ["Inês", "x"],
    ]);
  });
});

describe("parseDate", () => {
  it.each([
    ["2014-03-02", "2014-03-02"],
    ["2/3/2014", "2014-03-02"],
    ["02/03/2014", "2014-03-02"],
    ["30/02/2014", null],
    ["ontem", null],
  ])("%s → %s", (input, expected) => expect(parseDate(input)).toBe(expected));
});

describe("parseImport", () => {
  it("maps Portuguese headers and reports bad rows by line, without their content", () => {
    expect(normalizeHeader("Nº Sócio")).toBe("n socio");
    const { rows, issues } = parseImport(
      parseCsv(
        [
          "Nome;Sexo;Data de Nascimento;Email;Nº Sócio;Encarregado de Educação;Parentesco",
          "Ana Teste;F;02/03/2014;ana@example.test;12;Mãe Teste;Mãe",
          ";M;;;;;",
          "Rui Teste;X;01/01/2012;;;;",
          "Eva Teste;F;31/02/2012;;;;",
        ].join("\n"),
      ),
    );
    expect(rows).toMatchObject([
      {
        line: 2,
        fullName: "Ana Teste",
        sex: "female",
        birthDate: "2014-03-02",
        memberNumber: "12",
        guardianRelationship: "mother",
      },
    ]);
    expect(issues).toEqual([
      { line: 3, message: "missing name" },
      { line: 4, message: "unknown sex value" },
      { line: 5, message: "invalid birth date" },
    ]);
  });

  it("needs a name column", () => {
    expect(parseImport([["Foo"]]).issues[0]?.message).toMatch(/name column/);
  });
});

describeDb("importRows", () => {
  const csv = [
    "Nome,Data Nascimento,Sexo,N Licença,N Sócio,Equipa,Turma,Encarregado de Educação,Email EE,Telefone EE,Parentesco",
    "Ana Teste,02/03/2014,F,L1,100,Sub-12,,Mãe Teste,mae@example.test,900000001,Mãe",
    "Rui Teste,05/05/2015,M,,101,,T1,Mãe Teste,mae@example.test,,Mãe",
  ].join("\n");

  async function setup(db: Parameters<Parameters<typeof withRollback>[0]>[0]) {
    const season = await makeSeason(db);
    const org = await makeOrganisation(db);
    const refs = { seasonId: season.id, organisationId: org.id };
    const team = await makeTeam(db, refs, { name: "Sub-12" });
    const turma = await makeClass(db, refs, { code: "T1" });
    return {
      options: { organisationId: org.id, seasonId: season.id, today: "2026-10-15" },
      org,
      team,
      turma,
    };
  }

  it("creates people, memberships, one shared guardian and roster places", () =>
    withRollback(async (db) => {
      const { options, team, turma } = await setup(db);
      const summary = await importRows(db, parseImport(parseCsv(csv)).rows, options);
      expect(summary).toMatchObject({
        peopleCreated: 2,
        guardiansCreated: 1,
        guardianLinks: 2,
        memberships: 2,
        teamPlaces: 1,
        classPlaces: 1,
        issues: [],
      });
      expect(await db.select().from(guardianships)).toHaveLength(2);
      expect(await db.select().from(memberships)).toHaveLength(2);
      expect(
        await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id)),
      ).toHaveLength(1);
      expect(
        await db.select().from(classMembers).where(eq(classMembers.classId, turma.id)),
      ).toHaveLength(1);
    }));

  it("is idempotent and only fills empty fields", () =>
    withRollback(async (db) => {
      const { options } = await setup(db);
      const rows = parseImport(parseCsv(csv)).rows;
      await importRows(db, rows, options);
      const again = await importRows(db, rows, options);
      expect(again).toMatchObject({
        peopleCreated: 0,
        peopleUpdated: 0,
        guardiansCreated: 0,
        guardianLinks: 0,
        memberships: 0,
        issues: [],
      });

      const more = parseImport(
        parseCsv("Nome,Data Nascimento,Telemóvel\nAna Teste,02/03/2014,911111111"),
      ).rows;
      expect(await importRows(db, more, options)).toMatchObject({ peopleUpdated: 1 });
      const [ana] = await db
        .select()
        .from(persons)
        .where(and(eq(persons.federationId, "L1")));
      expect(ana).toMatchObject({ phone: "911111111", sex: "female" });
    }));

  it("reports unknown teams and conflicting member numbers by line and keeps going", () =>
    withRollback(async (db) => {
      const { options } = await setup(db);
      const text = [
        "Nome,N Sócio,Equipa",
        "Um Teste,200,Sub-99",
        "Dois Teste,201,",
        "Três Teste,201,",
      ].join("\n");
      const summary = await importRows(db, parseImport(parseCsv(text)).rows, options);
      expect(summary.issues).toEqual([
        { line: 2, message: "unknown team" },
        { line: 4, message: "database error 23505" },
      ]);
      expect(summary.peopleCreated).toBe(1);
    }));
});
