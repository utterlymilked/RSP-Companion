import { expect, it } from "vitest";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";

const note = {
  kind: "bug",
  message: "O botão Guardar não responde",
  route: "/booking/new",
  screenTitle: "Nova reserva",
  platform: "web",
  appVersion: "1.2.3",
  viewport: { width: 390, height: 844 },
  position: { x: 320, y: 600 },
};

describeDb("feedback", () => {
  it("lets testers send notes, and admins list, triage and export them", async () => {
    await withRollback(async (db) => {
      const t = testApp(db);
      const tester = await t.userWith([clubWide("tester")]);
      const admin = await t.userWith([clubWide("admin")]);

      const sent = await t.request("/api/feedback", {
        method: "POST",
        json: note,
        cookie: tester.cookie,
      });
      expect(sent.status).toBe(201);
      const { id } = (await sent.json()) as { id: string };

      const listed = await t.request("/api/feedback", { cookie: admin.cookie });
      const { entries } = (await listed.json()) as {
        entries: { id: string; authorName: string }[];
      };
      expect(entries.map((e) => e.id)).toEqual([id]);
      expect(entries[0]?.authorName).toBe(tester.user.name);

      const md = await t.request("/api/feedback/export", { cookie: admin.cookie });
      expect(md.headers.get("content-type")).toContain("text/markdown");
      const text = await md.text();
      expect(text).toContain("## Bug: O botão Guardar não responde");
      expect(text).toContain("`/booking/new`");
      expect(text).toContain("window 390×844");

      const done = await t.request(`/api/feedback/${id}`, {
        method: "PATCH",
        json: { status: "done" },
        cookie: admin.cookie,
      });
      expect(done.status).toBe(200);
      const open = await t.request("/api/feedback", { cookie: admin.cookie });
      expect(((await open.json()) as { entries: unknown[] }).entries).toHaveLength(0);
    });
  });

  it("lets admins send too, and refuses everyone else", async () => {
    await withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const staff = await t.userWith([clubWide("staff")]);
      const tester = await t.userWith([clubWide("tester")]);
      const post = (cookie?: string) =>
        t.request("/api/feedback", { method: "POST", json: note, cookie });

      expect((await post(admin.cookie)).status).toBe(201);
      expect((await post(staff.cookie)).status).toBe(403);
      expect((await post()).status).toBe(401);

      // Testers write but cannot read what others sent.
      expect((await t.request("/api/feedback", { cookie: tester.cookie })).status).toBe(403);
      expect((await t.request("/api/feedback/export", { cookie: tester.cookie })).status).toBe(403);
      expect((await t.request("/api/feedback", { cookie: staff.cookie })).status).toBe(403);
    });
  });

  it("rejects an empty note", async () => {
    await withRollback(async (db) => {
      const t = testApp(db);
      const tester = await t.userWith([clubWide("tester")]);
      const res = await t.request("/api/feedback", {
        method: "POST",
        json: { ...note, message: " " },
        cookie: tester.cookie,
      });
      expect(res.status).toBe(400);
    });
  });
});
