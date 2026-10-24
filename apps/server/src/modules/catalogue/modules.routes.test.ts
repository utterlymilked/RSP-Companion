import { expect, it } from "vitest";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";

describeDb("modules", () => {
  it("lets developers switch modules, cascading, and refuses everyone else", async () => {
    await withRollback(async (db) => {
      const t = testApp(db, { stack: "staging" });
      const dev = await t.userWith([clubWide("developer")]);
      const admin = await t.userWith([clubWide("admin")]);

      expect((await t.request("/api/modules", { cookie: admin.cookie })).status).toBe(403);
      expect((await t.request("/api/modules")).status).toBe(401);

      // alpha is off by default on staging: its routes answer module_disabled
      const off = await t.request("/api/events?from=2026-01-01&to=2026-01-02", {
        cookie: dev.cookie,
      });
      expect(off.status).toBe(404);
      expect(await off.json()).toEqual({ error: { code: "module_disabled" } });

      const on = await t.request("/api/modules/callups", {
        method: "PUT",
        json: { enabled: true },
        cookie: dev.cookie,
      });
      expect(on.status).toBe(200);
      const body = (await on.json()) as { modules: { id: string; enabled: boolean }[] };
      const enabled = body.modules.filter((m) => m.enabled).map((m) => m.id);
      expect(enabled).toEqual(expect.arrayContaining(["callups", "events", "persons"]));
      expect(
        (await t.request("/api/events?from=2026-01-01&to=2026-01-02", { cookie: dev.cookie }))
          .status,
      ).toBe(200);

      const cascade = await t.request("/api/modules/events", {
        method: "PUT",
        json: { enabled: false },
        cookie: dev.cookie,
      });
      const after = (await cascade.json()) as { modules: { id: string; enabled: boolean }[] };
      expect(after.modules.find((m) => m.id === "callups")?.enabled).toBe(false);

      const locked = await t.request("/api/modules/reservations", {
        method: "PUT",
        json: { enabled: false },
        cookie: dev.cookie,
      });
      expect(locked.status).toBe(409);
      expect(await locked.json()).toEqual({ error: { code: "module_locked" } });
    });
  });

  it("hides beta modules in production from everyone but testers", async () => {
    await withRollback(async (db) => {
      const t = testApp(db, { stack: "prod" });
      const dev = await t.userWith([clubWide("developer")]);
      const staff = await t.userWith([clubWide("staff")]);
      const tester = await t.userWith([clubWide("tester"), clubWide("staff")]);

      // beta is off by default in production, even for testers, until switched on
      expect((await t.request("/api/scouting/prospects", { cookie: tester.cookie })).status).toBe(
        404,
      );
      const on = await t.request("/api/modules/scouting", {
        method: "PUT",
        json: { enabled: true },
        cookie: dev.cookie,
      });
      expect(on.status).toBe(200);
      expect((await t.request("/api/scouting/prospects", { cookie: staff.cookie })).status).toBe(
        404,
      );
      expect((await t.request("/api/scouting/prospects", { cookie: tester.cookie })).status).toBe(
        200,
      );

      const me = (await (await t.request("/api/me", { cookie: staff.cookie })).json()) as {
        modules: string[];
      };
      expect(me.modules).toEqual(["reservations", "settings", "users", "teams"]);
      // alpha never reaches production
      const alpha = await t.request("/api/modules/events", {
        method: "PUT",
        json: { enabled: true },
        cookie: dev.cookie,
      });
      expect(alpha.status).toBe(409);
    });
  });
});
