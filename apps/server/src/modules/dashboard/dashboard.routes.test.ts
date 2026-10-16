import { expect, it } from "vitest";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { toCsv } from "./csv.js";

describeDb("dashboard API", () => {
  it("needs a session", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      expect((await t.request("/api/dashboard")).status).toBe(401);
      expect((await t.request("/api/dashboard/export/stock.csv")).status).toBe(401);
    }));

  it("shows each role only the widgets it may open", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const widgetsOf = async (role: Parameters<typeof clubWide>[0]) => {
        const user = await t.userWith([clubWide(role)]);
        const res = await t.request("/api/dashboard", { cookie: user.cookie });
        expect(res.status).toBe(200);
        return Object.keys(((await res.json()) as { widgets: object }).widgets).sort();
      };
      const admin = await widgetsOf("admin");
      expect(admin).toEqual(
        [
          "expiringDocuments",
          "lowStock",
          "openIncidents",
          "openLoans",
          "openPrivacyRequests",
          "overdueFees",
          "upcomingEvents",
        ].sort(),
      );
      const treasurer = await widgetsOf("treasurer");
      expect(treasurer).toContain("overdueFees");
      expect(treasurer).not.toContain("openPrivacyRequests");
      expect(await widgetsOf("athlete")).not.toContain("overdueFees");
      expect(await widgetsOf("athlete")).not.toContain("lowStock");
    }));

  it("exports CSV only to those who can list the data", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const treasurer = await t.userWith([clubWide("treasurer")]);
      const athlete = await t.userWith([clubWide("athlete")]);
      const ok = await t.request("/api/dashboard/export/overdue-fees.csv", {
        cookie: treasurer.cookie,
      });
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-type")).toContain("text/csv");
      expect(ok.headers.get("content-disposition")).toContain("overdue-fees.csv");
      const bytes = new Uint8Array(await ok.arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel
      expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toContain(
        "person,overdue_charges",
      );
      for (const path of ["overdue-fees", "stock", "expiring-documents"]) {
        const res = await t.request(`/api/dashboard/export/${path}.csv`, {
          cookie: athlete.cookie,
        });
        expect(res.status).toBe(403);
      }
      expect(
        (await t.request("/api/dashboard/export/stock.csv", { cookie: treasurer.cookie })).status,
      ).toBe(403);
    }));
});

it("escapes CSV cells and neutralises formulas", () => {
  expect(
    toCsv(
      ["a", "b"],
      [
        ['x,"y"', "=SUM(A1)"],
        [1, null],
      ],
    ),
  ).toBe(`﻿a,b\r\n"x,""y""",'=SUM(A1)\r\n1,\r\n`);
});
