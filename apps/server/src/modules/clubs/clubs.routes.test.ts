import { expect, it } from "vitest";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";

const json = async <T>(res: Response) => (await res.json()) as T;
interface Club {
  id: string;
  name: string;
  city: string | null;
}

const wikidata = [
  { c: { value: "http://www.wikidata.org/entity/Q1" }, cLabel: { value: "Real Sport Clube" } },
  {
    c: { value: "http://www.wikidata.org/entity/Q2" },
    cLabel: { value: "Atlético Clube de Portugal" },
    cityLabel: { value: "Lisboa" },
  },
  // Unlabelled entries come back as their Q-number and are skipped.
  { c: { value: "http://www.wikidata.org/entity/Q3" }, cLabel: { value: "Q3" } },
];

describeDb("clubs API", () => {
  it("imports the public list once, searches without accents and adds clubs by hand", () =>
    withRollback(async (db) => {
      const t = testApp(db, { fetchClubs: async () => wikidata });
      const office = await t.userWith([clubWide("staff")]);
      const scout = await t.userWith([clubWide("scout")]);

      const imported = await json<{ added: number; found: number }>(
        await t.request("/api/clubs/import-wikidata", {
          method: "POST",
          cookie: office.cookie,
        }),
      );
      expect(imported).toEqual({ added: 2, found: 3 });
      const again = await json<{ added: number }>(
        await t.request("/api/clubs/import-wikidata", { method: "POST", cookie: office.cookie }),
      );
      expect(again.added).toBe(0);

      const found = await json<{ clubs: Club[] }>(
        await t.request("/api/clubs?q=atletico", { cookie: scout.cookie }),
      );
      expect(found.clubs.map((c) => [c.name, c.city])).toEqual([
        ["Atlético Clube de Portugal", "Lisboa"],
      ]);

      const created = await t.request("/api/clubs", {
        cookie: scout.cookie,
        json: { name: "  Clube Novo da Aldeia " },
      });
      expect(created.status).toBe(201);
      const same = await t.request("/api/clubs", {
        cookie: scout.cookie,
        json: { name: "clube novo da aldeia" },
      });
      expect((await json<{ club: Club }>(same)).club.name).toBe("Clube Novo da Aldeia");
      const all = await json<{ clubs: Club[] }>(
        await t.request("/api/clubs", { cookie: scout.cookie }),
      );
      expect(all.clubs).toHaveLength(3);
    }));

  it("keeps the import to the office and the picker to scouting roles", () =>
    withRollback(async (db) => {
      const t = testApp(db, { fetchClubs: async () => wikidata });
      const scout = await t.userWith([clubWide("scout")]);
      const parent = await t.userWith([clubWide("guardian")]);
      expect((await t.request("/api/clubs")).status).toBe(401);
      expect((await t.request("/api/clubs", { cookie: parent.cookie })).status).toBe(403);
      expect(
        (await t.request("/api/clubs/import-wikidata", { method: "POST", cookie: scout.cookie }))
          .status,
      ).toBe(403);
    }));

  it("reports an unreachable Wikidata as 502", () =>
    withRollback(async (db) => {
      const t = testApp(db, {
        fetchClubs: async () => {
          throw new Error("offline");
        },
      });
      const office = await t.userWith([clubWide("admin")]);
      const res = await t.request("/api/clubs/import-wikidata", {
        method: "POST",
        cookie: office.cookie,
      });
      expect(res.status).toBe(502);
      expect((await res.json()).error.code).toBe("upstream_unavailable");
    }));
});
