import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";

const json = async <T>(res: Response) => (await res.json()) as T;
interface Item {
  id: string;
  stock: number;
  low: boolean;
}

async function setup(db: Db) {
  const t = testApp(db);
  const stores = await t.userWith([clubWide("stores")]);
  const post = (path: string, body: unknown, cookie = stores.cookie) =>
    t.request(`/api/equipment${path}`, { cookie, json: body });
  const ret = (id: string) =>
    t.request(`/api/equipment/loans/${id}/return`, { cookie: stores.cookie, method: "POST" });
  const get = (path: string, cookie = stores.cookie) =>
    t.request(`/api/equipment${path}`, { cookie });
  const newItem = async (extra: Record<string, unknown> = {}) =>
    (
      await json<{ item: Item }>(
        await post("/items", {
          name: "Camisola oficial",
          category: "kit",
          size: "M",
          priceCents: 2500,
          minStock: 3,
          ...extra,
        }),
      )
    ).item;
  return { t, stores, post, get, ret, newItem };
}

describeDb("equipment API", () => {
  it("lets the office and stores manage the economato, others at most nothing", () =>
    withRollback(async (db) => {
      const { t, post, get } = await setup(db);
      expect((await t.request("/api/equipment/items")).status).toBe(401);
      for (const role of ["athlete", "treasurer", "member"] as const) {
        const user = await t.userWith([clubWide(role)]);
        expect((await get("/items", user.cookie)).status).toBe(403);
        expect((await post("/items", { name: "Bola", category: "ball" }, user.cookie)).status).toBe(
          403,
        );
      }
      const staff = await t.userWith([clubWide("staff")]);
      expect(
        (await post("/items", { name: "Bola n.º 5", category: "ball" }, staff.cookie)).status,
      ).toBe(201);
      expect((await post("/items", { name: " ", category: "ball" })).status).toBe(400);
    }));

  it("keeps stock as the sum of movements and refuses to go below zero", () =>
    withRollback(async (db) => {
      const { newItem, post, get } = await setup(db);
      const item = await newItem();
      expect(item.low).toBe(true);
      const received = await json<{ item: Item }>(
        await post(`/items/${item.id}/movements`, { kind: "receipt", quantity: 10 }),
      );
      expect(received.item).toMatchObject({ stock: 10, low: false });
      const loss = await post(`/items/${item.id}/movements`, { kind: "loss", quantity: 8 });
      expect((await json<{ item: Item }>(loss)).item).toMatchObject({ stock: 2, low: true });
      const tooMany = await post(`/items/${item.id}/movements`, { kind: "sale", quantity: 3 });
      expect(tooMany.status).toBe(409);
      expect((await json<{ error: { code: string } }>(tooMany)).error.code).toBe(
        "insufficient_stock",
      );
      // Counts: signed adjustment; sign rules and zero are validated.
      expect(
        (await post(`/items/${item.id}/movements`, { kind: "adjustment", quantity: -2 })).status,
      ).toBe(201);
      expect(
        (await post(`/items/${item.id}/movements`, { kind: "adjustment", quantity: 0 })).status,
      ).toBe(400);
      expect(
        (await post(`/items/${item.id}/movements`, { kind: "receipt", quantity: -1 })).status,
      ).toBe(400);
      expect(
        (await post(`/items/${item.id}/movements`, { kind: "loan", quantity: 1 })).status,
      ).toBe(400);
      const detail = await json<{ item: Item; movements: unknown[] }>(
        await get(`/items/${item.id}`),
      );
      expect(detail.item.stock).toBe(0);
      expect(detail.movements).toHaveLength(3);
      expect(
        (
          await post(`/items/00000000-0000-4000-8000-000000000000/movements`, {
            kind: "receipt",
            quantity: 1,
          })
        ).status,
      ).toBe(404);
    }));

  it("records sales with the buyer and defaults to the item's price", () =>
    withRollback(async (db) => {
      const { newItem, post, get } = await setup(db);
      const buyer = await makePerson(db);
      const item = await newItem();
      await post(`/items/${item.id}/movements`, { kind: "receipt", quantity: 5 });
      await post(`/items/${item.id}/movements`, {
        kind: "sale",
        quantity: 1,
        personId: buyer.id,
      });
      await post(`/items/${item.id}/movements`, {
        kind: "sale",
        quantity: 1,
        unitPriceCents: 2000,
      });
      const { movements } = await json<{
        movements: { kind: string; unitPriceCents: number | null; delta: number }[];
      }>(await get(`/items/${item.id}`));
      const sales = movements.filter((m) => m.kind === "sale");
      expect(sales.map((m) => m.unitPriceCents).sort()).toEqual([2000, 2500]);
      expect(sales.every((m) => m.delta === -1)).toBe(true);
    }));

  it("rejects a duplicate item (same name and size) and filters low stock", () =>
    withRollback(async (db) => {
      const { newItem, post, get } = await setup(db);
      await newItem();
      expect(
        (await post("/items", { name: "Camisola oficial", category: "kit", size: "M" })).status,
      ).toBe(409);
      const large = await newItem({ size: "L", minStock: 0 });
      await post(`/items/${large.id}/movements`, { kind: "receipt", quantity: 4 });
      const low = await json<{ items: Item[] }>(await get("/items?low=true"));
      expect(low.items).toHaveLength(1);
      expect((await json<{ items: Item[] }>(await get("/items"))).items).toHaveLength(2);
    }));

  it("lends to a person or a team and takes the stock back on return", () =>
    withRollback(async (db) => {
      const { newItem, post, get, ret } = await setup(db);
      const org = await makeOrganisation(db);
      const season = await makeSeason(db);
      const team = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
      const person = await makePerson(db);
      const item = await newItem({ name: "Coletes", category: "bib", size: null });
      await post(`/items/${item.id}/movements`, { kind: "receipt", quantity: 12 });

      const loaned = await post("/loans", { itemId: item.id, quantity: 12, teamId: team.id });
      expect(loaned.status).toBe(201);
      const { loan } = await json<{ loan: { id: string; returnedAt: string | null } }>(loaned);
      expect((await json<{ item: Item }>(await get(`/items/${item.id}`))).item.stock).toBe(0);
      // Out of stock, and the borrower must be exactly one of person / team.
      expect(
        (await post("/loans", { itemId: item.id, quantity: 1, personId: person.id })).status,
      ).toBe(409);
      expect(
        (
          await post("/loans", {
            itemId: item.id,
            quantity: 1,
            personId: person.id,
            teamId: team.id,
          })
        ).status,
      ).toBe(400);
      expect((await post("/loans", { itemId: item.id, quantity: 1 })).status).toBe(400);

      const open = await json<{ loans: unknown[] }>(
        await get(`/loans?open=true&teamId=${team.id}`),
      );
      expect(open.loans).toHaveLength(1);
      expect((await ret(loan.id)).status).toBe(200);
      expect((await json<{ item: Item }>(await get(`/items/${item.id}`))).item.stock).toBe(12);
      expect((await ret(loan.id)).status).toBe(409);
      expect((await json<{ loans: unknown[] }>(await get("/loans?open=true"))).loans).toHaveLength(
        0,
      );
      expect((await ret("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    }));
});
