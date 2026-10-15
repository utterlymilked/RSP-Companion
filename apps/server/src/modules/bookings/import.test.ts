import { expect, it } from "vitest";
import { describeDb, withRollback } from "../../test/db.js";
import { makeDepartment, makeOrganisation, makeSpace } from "../../test/factories.js";
import { parseCsv } from "../people/import.js";
import { importBookings, parseBookingImport, parseTime } from "./import.js";
import { listBookings } from "./service.js";

const HEADER =
  "Infraestrutura;Gabinete;Data;Atividade;Início;Fim;Duração;Estado;Público alvo;Previstos;Reais;Observações";
const parse = (...lines: string[]) => parseBookingImport(parseCsv([HEADER, ...lines].join("\n")));

it("reads times written as 18:30, 18h30 or 18h", () => {
  expect(parseTime("18:30")).toBe("18:30");
  expect(parseTime("9h")).toBe("9:00");
  expect(parseTime("18h30")).toBe("18:30");
  expect(parseTime("25:00")).toBeNull();
  expect(parseTime("tarde")).toBeNull();
});

it("maps the sheet's columns, statuses and activities", () => {
  const { rows, issues } = parse(
    "Auditório;Direção;20/10/2026;Reunião EE/jogadores;18:00;19:30;1:30;A confirmar;Pais/EE;60;;Trazer projetor",
    "Auditório;Direção;21/10/2026;Formação;18h;19h;;Realizado;Sub-13;20;18;",
  );
  expect(issues).toEqual([]);
  expect(rows[0]).toMatchObject({
    activity: "meeting",
    status: "to_confirm",
    expectedAttendance: 60,
    actualAttendance: null,
    notes: "Trazer projetor",
    title: "Reunião EE/jogadores",
  });
  // 18:00 Lisbon in October (summer time) is 17:00 UTC.
  expect(rows[0]?.startsAt.toISOString()).toBe("2026-10-20T17:00:00.000Z");
  expect(rows[1]).toMatchObject({ activity: "formation", status: "done", actualAttendance: 18 });
});

it("reports bad rows by line number without echoing their content", () => {
  const { rows, issues } = parse(
    "Auditório;Direção;31/02/2026;Reunião;18:00;19:00;;Confirmado;;;;",
    "Auditório;Direção;20/10/2026;Reunião;19:00;18:00;;Confirmado;;;;",
    "Auditório;Direção;20/10/2026;Reunião;18:00;19:00;;Talvez;;;;",
    "Auditório;Direção;20/10/2026;Reunião;18:00;19:00;;Confirmado;;muitos;;",
  );
  expect(rows).toEqual([]);
  expect(issues.map((i) => i.line)).toEqual([2, 3, 4, 5]);
  expect(issues[0]?.message).toBe("invalid date");
  expect(JSON.stringify(issues)).not.toContain("Auditório");
});

it("needs the core columns", () => {
  const { issues } = parseBookingImport(parseCsv("Nome;Idade\nAna;3"));
  expect(issues[0]?.message).toContain("missing columns");
});

describeDb("importBookings", () => {
  it("creates bookings, skips repeats and flags overlaps and unknown names", () =>
    withRollback(async (db) => {
      const org = await makeOrganisation(db);
      const dept = await makeDepartment(db, org.id, "Direção RSC");
      await makeSpace(db, { name: "Auditório" });
      const { rows } = parse(
        "Auditório;Direção RSC;20/10/2026;Reunião;18:00;19:00;;Confirmado;;50;;",
        "Auditório;Direção RSC;20/10/2026;Reunião;18:30;19:30;;Confirmado;;;;",
        "Auditório;Direção RSC;20/10/2026;Reunião;18:30;19:30;;Cancelado;;;;",
        "Sala fantasma;Direção RSC;20/10/2026;Reunião;18:00;19:00;;Confirmado;;;;",
        "Auditório;Gabinete fantasma;20/10/2026;Reunião;18:00;19:00;;Confirmado;;;;",
      );
      const first = await importBookings(db, rows);
      expect(first).toMatchObject({ created: 2, alreadyThere: 0 });
      expect(first.issues).toEqual([
        { line: 3, message: "overlaps another booking" },
        { line: 5, message: "unknown space" },
        { line: 6, message: "unknown department" },
      ]);
      const second = await importBookings(db, rows);
      expect(second).toMatchObject({ created: 0, alreadyThere: 3 });
      const saved = await listBookings(db, {
        from: new Date("2026-10-01T00:00:00Z"),
        to: new Date("2026-11-01T00:00:00Z"),
      });
      expect(saved.map((b) => [b.status, b.departmentId])).toEqual([
        ["confirmed", dept.id],
        ["cancelled", dept.id],
      ]);
    }));
});
