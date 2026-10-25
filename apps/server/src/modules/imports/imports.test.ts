import type { ImportReport } from "@rsc/shared";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { expect, it } from "vitest";
import { clubWide, TEST_APP_URL, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import {
  makeAgeGroup,
  makeOrganisation,
  makePerson,
  makeSeason,
  makeTeam,
} from "../../test/factories.js";
import { personalFactsOf } from "../people/facts.js";
import { persons, players } from "../people/schema.js";
import { teamMembers, teams } from "../teams/schema.js";
import { buildTemplate, readTable } from "./xlsx.js";

async function sheet(rows: (string | number | Date | null)[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  for (const r of rows) ws.addRow(r);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const PLAYER_HEADER = [
  "Código",
  "Nome",
  "Alias",
  "Sexo",
  "Data de nascimento",
  "Posição",
  "Equipa",
  "Nº camisola",
];

async function setup(db: Parameters<typeof makeSeason>[0]) {
  const season = await makeSeason(db, { isCurrent: true });
  const org = await makeOrganisation(db, { kind: "club" });
  const t = testApp(db);
  const upload = (path: string, body: Uint8Array | null, cookie?: string) =>
    t.app.request(path, {
      method: "POST",
      headers: { origin: TEST_APP_URL, ...(cookie ? { cookie } : {}) },
      body: body as BodyInit | null,
    });
  return { season, org, t, upload };
}

describeDb("excel import", () => {
  it("round-trips the template headers", async () => {
    const parsed = await readTable(await buildTemplate("players"));
    expect(parsed?.table[0]?.[0]).toBe("Código");
    expect(parsed?.table).toHaveLength(1);
  });

  it("previews without writing, then applies players, including ones without a name", () =>
    withRollback(async (db) => {
      const { season, org, t, upload } = await setup(db);
      await makeTeam(db, { seasonId: season.id, organisationId: org.id }, { name: "Sub-13 A" });
      const { cookie } = await t.userWith([clubWide("staff")]);
      const file = await sheet([
        PLAYER_HEADER,
        [
          null,
          "Rui Teste",
          null,
          "Masculino",
          new Date(Date.UTC(2014, 2, 5)),
          "Defesa",
          "Sub-13 A",
          7,
        ],
        [null, null, "Jogador 9", null, null, "Guarda-redes", "sub-13 a", null],
        [null, null, null, null, null, null, null, null],
        [null, "Ana Teste", null, "Z", null, null, null, null],
        [null, "Bia Teste", null, null, null, null, "Inexistente", null],
      ]);

      const preview = await upload("/api/imports/players/preview", file, cookie);
      expect(preview.status).toBe(200);
      const p = (await preview.json()) as ImportReport;
      expect(p.applied).toBe(false);
      expect(p.counts).toEqual({ create: 2, update: 0, unchanged: 0, error: 2 });
      expect(p.rows.map((r) => [r.line, r.status, r.error])).toEqual([
        [2, "create", null],
        [3, "create", null],
        [5, "error", "invalid_sex"],
        [6, "error", "unknown_team"],
      ]);
      expect(await db.select().from(persons)).toHaveLength(0);

      const applied = (await (
        await upload("/api/imports/players/apply", file, cookie)
      ).json()) as ImportReport;
      expect(applied.applied).toBe(true);
      expect(applied.counts.create).toBe(2);
      const alias = applied.rows[1];
      expect(alias?.identityCode).toMatch(/^RSC-[0-9A-F]{8}$/);

      const [anon] = await db.select().from(persons).where(eq(persons.displayName, "Jogador 9"));
      expect(anon).toMatchObject({
        isPseudonymous: true,
        fullName: "Jogador 9",
        birthDate: null,
      });
      expect(await personalFactsOf(db, anon?.id ?? "")).toMatchObject({ email: null });
      expect(await db.select().from(players)).toHaveLength(2);
      const roster = await db.select().from(teamMembers);
      expect(roster).toHaveLength(2);
      expect(roster.find((m) => m.shirtNumber === 7)).toBeDefined();

      // Same file again: the named player is found by name and birth date, the alias by alias.
      const again = (await (
        await upload("/api/imports/players/apply", file, cookie)
      ).json()) as ImportReport;
      expect(again.counts).toMatchObject({ create: 0, unchanged: 2, error: 2 });
      expect(await db.select().from(persons)).toHaveLength(2);
    }));

  it("claims an alias by code when a real name arrives", () =>
    withRollback(async (db) => {
      const { t, upload } = await setup(db);
      const alias = await makePerson(db, {
        fullName: "Jogador 3",
        displayName: "Jogador 3",
        isPseudonymous: true,
      });
      const { cookie } = await t.userWith([clubWide("admin")]);
      const file = await sheet([
        PLAYER_HEADER,
        [alias.identityCode, "Nome Real", null, null, null, null, null, null],
      ]);
      const res = (await (
        await upload("/api/imports/players/apply", file, cookie)
      ).json()) as ImportReport;
      expect(res.rows[0]).toMatchObject({ status: "update", identityCode: alias.identityCode });
      const [after] = await db.select().from(persons).where(eq(persons.id, alias.id));
      expect(after).toMatchObject({
        fullName: "Nome Real",
        isPseudonymous: false,
        identityCode: alias.identityCode,
      });

      const unknown = await sheet([
        PLAYER_HEADER,
        ["RSC-00000000", "X", null, null, null, null, null, null],
      ]);
      const bad = (await (
        await upload("/api/imports/players/preview", unknown, cookie)
      ).json()) as ImportReport;
      expect(bad.rows[0]?.error).toBe("unknown_code");
    }));

  it("imports teams into the current season", () =>
    withRollback(async (db) => {
      const { season, org, t, upload } = await setup(db);
      await makeAgeGroup(db, season.id, { name: "Sub-13", category: "male" });
      const { cookie } = await t.userWith([clubWide("staff")]);
      const file = await sheet([
        ["Nome", "Escalão", "Categoria", "Organização"],
        ["Sub-13 A", "Sub-13", "Masculino", null],
        ["Sub-99", "Sub-99", "Masculino", null],
        ["Sub-13 A", null, "Masculino", null],
      ]);
      const res = (await (
        await upload("/api/imports/teams/apply", file, cookie)
      ).json()) as ImportReport;
      expect(res.rows.map((r) => [r.status, r.error])).toEqual([
        ["create", null],
        ["error", "unknown_age_group"],
        ["error", "duplicate_in_file"],
      ]);
      const created = await db.select().from(teams).where(eq(teams.organisationId, org.id));
      expect(created.map((x) => x.name)).toEqual(["Sub-13 A"]);
    }));

  it("reports unreadable files and enforces permissions", () =>
    withRollback(async (db) => {
      const { t, upload } = await setup(db);
      const admin = await t.userWith([clubWide("staff")]);
      const junk = (await (
        await upload("/api/imports/players/preview", new Uint8Array([1, 2, 3]), admin.cookie)
      ).json()) as ImportReport;
      expect(junk.rows[0]).toMatchObject({ line: 0, error: "unreadable_file" });
      expect((await upload("/api/imports/players/preview", null, admin.cookie)).status).toBe(400);
      expect((await upload("/api/imports/players/preview", new Uint8Array([1]))).status).toBe(401);
      const coach = await t.userWith([clubWide("treasurer")]);
      expect(
        (await upload("/api/imports/players/apply", new Uint8Array([1]), coach.cookie)).status,
      ).toBe(403);
      expect(
        (await t.request("/api/imports/players/template", { cookie: coach.cookie })).status,
      ).toBe(403);
      const tpl = await t.request("/api/imports/teams/template", { cookie: admin.cookie });
      expect(tpl.status).toBe(200);
      expect(tpl.headers.get("content-disposition")).toContain("modelo-equipas.xlsx");
    }));

  it("exposes the identity facets of a person", () =>
    withRollback(async (db) => {
      const { t } = await setup(db);
      const person = await makePerson(db);
      await db.insert(players).values({ personId: person.id, position: "forward" });
      const { cookie } = await t.userWith([clubWide("staff")]);
      const res = await t.request(`/api/people/${person.id}/identity`, { cookie });
      expect(res.status).toBe(200);
      const { identity } = (await res.json()) as { identity: Record<string, unknown> };
      expect(identity).toMatchObject({
        identityCode: person.identityCode,
        isPseudonymous: false,
        player: { position: "forward", dominantFoot: null },
        hasLogin: false,
        teams: [],
      });
      expect((await t.request(`/api/people/${person.id}/identity`)).status).toBe(401);
    }));
});
