import { expect, it } from "vitest";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makeSeason, makeTeam } from "../../test/factories.js";
import { parseCsv } from "../people/import.js";
import { formatOf, importMatches, parseMatchImport } from "./import.js";
import { listEvents } from "./service.js";

const HEADER =
  "Equipa;Escalão;Data;Atividade;Estado;Jornada;Início;Fim;Formato;Adversário;Local;Transporte;Equipamento;Observações";
const parse = (...lines: string[]) => parseMatchImport(parseCsv([HEADER, ...lines].join("\n")));

it("reads formats written in the sheet's styles", () => {
  expect(formatOf("Fut 7")).toBe("fut7");
  expect(formatOf("fut 4+GR")).toBe("fut4");
  expect(formatOf("F11")).toBe("fut11");
  expect(formatOf("fut 9")).toBeNull();
  expect(formatOf(null)).toBeNull();
});

it("maps matches, competition type and home or away", () => {
  const { rows, issues } = parse(
    "Sub-13 A;Sub-13 masc;14/11/2026;Campeonato FPF;Confirmado;3;10:00;11:30;Fut 7;Clube X;Campo 1;;Preto;",
    "Sub-13 A;Sub-13 masc;21/11/2026;Jogo treino;;;10h;11h30;fut 7;Clube Y;Estádio Z;Autocarro;;Levar bolas",
  );
  expect(issues).toEqual([]);
  expect(rows[0]).toMatchObject({
    matchType: "league",
    homeAway: "home",
    format: "fut7",
    round: "3",
    kit: "Preto",
    status: "scheduled",
  });
  // 10:00 Lisbon in November (winter time) is 10:00 UTC.
  expect(rows[0]?.startsAt.toISOString()).toBe("2026-11-14T10:00:00.000Z");
  expect(rows[1]).toMatchObject({
    matchType: "friendly",
    homeAway: "away",
    transport: "Autocarro",
  });
});

it("reports bad rows by line number without echoing their content", () => {
  const { rows, issues } = parse(
    "A;B;31/02/2026;Jogo;;;10:00;11:00;;Clube X;;;;",
    "A;B;14/11/2026;Jogo;;;10:00;11:00;;;;;;",
    "A;B;14/11/2026;Jogo;talvez;;12:00;11:00;;Clube X;;;;",
  );
  expect(rows).toEqual([]);
  expect(issues.map((i) => i.line)).toEqual([2, 3, 4]);
  expect(JSON.stringify(issues)).not.toContain("Clube X");
  expect(parseMatchImport(parseCsv("Foo;Bar\n1;2")).issues[0]?.message).toContain(
    "missing columns",
  );
});

describeDb("matches import", () => {
  it("creates matches once, linking teams that exist", () =>
    withRollback(async (db) => {
      const org = await makeOrganisation(db);
      const season = await makeSeason(db);
      await makeTeam(db, { seasonId: season.id, organisationId: org.id }, { name: "Sub-13 A" });
      const { rows } = parse(
        "Sub-13 A;S13;14/11/2026;Campeonato;;3;10:00;11:30;Fut 7;Clube X;Campo 1;;;",
        "Sub-99;S99;14/11/2026;Taça;;1;12:00;13:30;Fut 7;Clube Y;Fora;;;",
      );
      const first = await importMatches(db, rows);
      expect(first).toMatchObject({ created: 2, alreadyThere: 0 });
      expect(first.issues).toEqual([{ line: 3, message: "unknown team, imported without one" }]);
      expect(await importMatches(db, rows)).toMatchObject({ created: 0, alreadyThere: 2 });
      const list = await listEvents(db, {
        from: new Date("2026-11-14T00:00:00Z"),
        to: new Date("2026-11-15T00:00:00Z"),
      });
      expect(list.map((e) => e.opponent)).toEqual(["Clube X", "Clube Y"]);
      expect(list[0]?.teamName).toBe("Sub-13 A");
      expect(list[1]?.matchType).toBe("cup");
    }));
});
