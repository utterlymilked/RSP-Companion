import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makePerson, makeSeason } from "../../test/factories.js";
import { chargeStatus, todayInLisbon } from "./service.js";

const json = async <T>(res: Response) => (await res.json()) as T;
interface ChargeBody {
  id: string;
  status: string;
  netCents: number;
  paidCents: number;
  balanceCents: number;
}

async function setup(db: Db) {
  const t = testApp(db);
  const treasurer = await t.userWith([clubWide("treasurer")]);
  const person = await makePerson(db);
  const call = (path: string, body?: unknown, cookie = treasurer.cookie) =>
    t.request(`/api/fees${path}`, body === undefined ? { cookie } : { cookie, json: body });
  const newCharge = async (extra: Record<string, unknown> = {}) =>
    json<{ charge: ChargeBody }>(
      await call("/charges", {
        personId: person.id,
        kind: "monthly",
        description: "Mensalidade outubro",
        amountCents: 2000,
        dueDate: "2999-01-01",
        ...extra,
      }),
    ).then((r) => r.charge);
  return { t, treasurer, person, call, newCharge };
}

describeDb("fees API", () => {
  it("is for admin and treasurer only", () =>
    withRollback(async (db) => {
      const { t, call, person } = await setup(db);
      expect((await t.request("/api/fees/charges")).status).toBe(401);
      for (const role of ["staff", "stores", "scout", "athlete", "guardian"] as const) {
        const user = await t.userWith([clubWide(role)]);
        expect((await call("/charges", undefined, user.cookie)).status).toBe(403);
        expect((await call("/overdue", undefined, user.cookie)).status).toBe(403);
        const body = {
          personId: person.id,
          kind: "dues",
          description: "Quota",
          amountCents: 1000,
          dueDate: "2999-01-01",
        };
        expect((await call("/charges", body, user.cookie)).status).toBe(403);
      }
      const admin = await t.userWith([clubWide("admin")]);
      expect((await call("/charges", undefined, admin.cookie)).status).toBe(200);
    }));

  it("applies discounts and settles a charge through payments with receipts", () =>
    withRollback(async (db) => {
      const { call, newCharge } = await setup(db);
      const charge = await newCharge({ discountCents: 500 });
      expect(charge).toMatchObject({ netCents: 1500, paidCents: 0, status: "open" });
      const first = await call(`/charges/${charge.id}/payments`, {
        amountCents: 1000,
        method: "cash",
      });
      expect(first.status).toBe(201);
      const body = await json<{
        payment: { receiptNumber: number; paidOn: string };
        charge: ChargeBody;
      }>(first);
      expect(body.charge).toMatchObject({ paidCents: 1000, balanceCents: 500, status: "open" });
      expect(body.payment.paidOn).toBe(todayInLisbon());
      const second = await json<{ payment: { receiptNumber: number }; charge: ChargeBody }>(
        await call(`/charges/${charge.id}/payments`, {
          amountCents: 500,
          method: "bank_transfer",
          paidOn: "2026-10-01",
        }),
      );
      expect(second.charge.status).toBe("paid");
      expect(second.payment.receiptNumber).toBeGreaterThan(body.payment.receiptNumber);
      const detail = await json<{ payments: unknown[] }>(await call(`/charges/${charge.id}`));
      expect(detail.payments).toHaveLength(2);
    }));

  it("refuses overpayment, bad amounts and invalid charges", () =>
    withRollback(async (db) => {
      const { call, newCharge, person } = await setup(db);
      const charge = await newCharge();
      const pay = (amountCents: number) =>
        call(`/charges/${charge.id}/payments`, { amountCents, method: "cash" });
      expect((await pay(2001)).status).toBe(409);
      expect((await pay(0)).status).toBe(400);
      expect((await pay(2000)).status).toBe(201);
      expect((await pay(1)).status).toBe(409);
      const bad = { personId: person.id, kind: "dues", description: "x", dueDate: "2999-01-01" };
      expect(
        (await call("/charges", { ...bad, amountCents: 1000, discountCents: 1000 })).status,
      ).toBe(400);
      expect((await call("/charges", { ...bad, amountCents: 0 })).status).toBe(400);
    }));

  it("cancels charges, keeping them on record and refusing payments", () =>
    withRollback(async (db) => {
      const { call, newCharge } = await setup(db);
      const charge = await newCharge();
      const res = await json<{ charge: ChargeBody }>(
        await call(`/charges/${charge.id}/cancel`, { reason: "Duplicada" }),
      );
      expect(res.charge).toMatchObject({ status: "cancelled", balanceCents: 0 });
      expect((await call(`/charges/${charge.id}/cancel`, {})).status).toBe(409);
      const pay = await call(`/charges/${charge.id}/payments`, {
        amountCents: 100,
        method: "cash",
      });
      expect(pay.status).toBe(409);
    }));

  it("reports overdue balances per person and filters by status", () =>
    withRollback(async (db) => {
      const { call, newCharge, person } = await setup(db);
      await newCharge({ dueDate: "2020-01-01" });
      const partly = await newCharge({ dueDate: "2020-02-01" });
      await call(`/charges/${partly.id}/payments`, { amountCents: 500, method: "cash" });
      await newCharge({ dueDate: "2999-01-01" });
      const report = await json<{
        overdue: {
          personId: string;
          chargeCount: number;
          balanceCents: number;
          oldestDueDate: string;
        }[];
      }>(await call("/overdue"));
      expect(report.overdue).toEqual([
        {
          personId: person.id,
          personName: expect.any(String),
          chargeCount: 2,
          balanceCents: 3500,
          oldestDueDate: "2020-01-01",
        },
      ]);
      const open = await json<{ charges: ChargeBody[] }>(await call("/charges?status=open"));
      expect(open.charges).toHaveLength(1);
      const mine = await json<{ charges: ChargeBody[] }>(
        await call(`/charges?personId=${person.id}`),
      );
      expect(mine.charges).toHaveLength(3);
    }));

  it("creates charges from a plan for several people", () =>
    withRollback(async (db) => {
      const { t, treasurer, call } = await setup(db);
      const season = await makeSeason(db);
      const plan = await json<{ plan: { id: string } }>(
        await call("/plans", {
          seasonId: season.id,
          name: "Mensalidade sub-13",
          kind: "monthly",
          amountCents: 2500,
        }),
      );
      const [a, b] = [await makePerson(db), await makePerson(db)];
      const res = await call("/charges/from-plan", {
        planId: plan.plan.id,
        personIds: [a.id, b.id, a.id],
        dueDate: "2026-11-08",
        discountCents: 250,
      });
      expect(res.status).toBe(201);
      expect((await json<{ created: number }>(res)).created).toBe(2);
      const list = await json<{ charges: ChargeBody[] }>(await call(`/charges?personId=${a.id}`));
      expect(list.charges[0]).toMatchObject({ netCents: 2250 });
      const patched = await t.request(`/api/fees/plans/${plan.plan.id}`, {
        cookie: treasurer.cookie,
        method: "PATCH",
        json: { amountCents: 2600 },
      });
      expect(patched.status).toBe(200);
      expect(
        (
          await call("/charges/from-plan", {
            planId: crypto.randomUUID(),
            personIds: [a.id],
            dueDate: "2026-11-08",
          })
        ).status,
      ).toBe(404);
    }));

  it("bills an economato sale once", () =>
    withRollback(async (db) => {
      const { t, call, person } = await setup(db);
      const stores = await t.userWith([clubWide("stores")]);
      const eq = (path: string, body: unknown) =>
        t.request(`/api/equipment${path}`, { cookie: stores.cookie, json: body });
      const item = await json<{ item: { id: string } }>(
        await eq("/items", { name: "Camisola", category: "kit", size: "M", priceCents: 2500 }),
      );
      await eq(`/items/${item.item.id}/movements`, { kind: "receipt", quantity: 5 });
      const sale = await json<{ movement: { id: string } }>(
        await eq(`/items/${item.item.id}/movements`, {
          kind: "sale",
          quantity: 2,
          personId: person.id,
        }),
      );
      const billed = await call("/charges/from-sale", {
        movementId: sale.movement.id,
        dueDate: "2026-11-30",
      });
      expect(billed.status).toBe(201);
      expect((await json<{ charge: ChargeBody & { kind: string } }>(billed)).charge).toMatchObject({
        netCents: 5000,
        kind: "kit",
      });
      expect(
        (await call("/charges/from-sale", { movementId: sale.movement.id, dueDate: "2026-11-30" }))
          .status,
      ).toBe(409);
      const receipt = await json<{ movement: { id: string } }>(
        await eq(`/items/${item.item.id}/movements`, { kind: "receipt", quantity: 1 }),
      );
      expect(
        (
          await call("/charges/from-sale", {
            movementId: receipt.movement.id,
            dueDate: "2026-11-30",
          })
        ).status,
      ).toBe(409);
    }));
});

it("derives the status of a charge", () => {
  const c = { amountCents: 1000, discountCents: 0, dueDate: "2026-10-10", cancelledAt: null };
  expect(chargeStatus(c, 0, "2026-10-10")).toBe("open");
  expect(chargeStatus(c, 0, "2026-10-11")).toBe("overdue");
  expect(chargeStatus(c, 1000, "2026-10-11")).toBe("paid");
  expect(chargeStatus({ ...c, cancelledAt: new Date() }, 0, "2026-10-11")).toBe("cancelled");
});
