import { expect, it } from "vitest";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { auditLog } from "../audit/schema.js";
import { approvalRequests } from "./schema.js";
import { createApproval, remindReviewers } from "./service.js";

const decide = (
  t: ReturnType<typeof testApp>,
  cookie: string,
  id: string,
  json: { decision: string; reason?: string },
) => t.request(`/api/approvals/${id}/decision`, { json, cookie });

describeDb("approvals queue", () => {
  it("lets admin and HR list and decide, and refuses everyone else", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const requester = await t.userWith([clubWide("anonymous")]);
      const request = await createApproval(db, { type: "test", subjectUserId: requester.user.id });
      for (const role of ["admin", "hr", "developer"] as const) {
        const u = await t.userWith([clubWide(role)]);
        const res = await t.request("/api/approvals", { cookie: u.cookie });
        expect(res.status).toBe(200);
      }
      for (const role of ["staff", "anonymous", "external", "coach"] as const) {
        const grant = role === "coach" ? [] : [clubWide(role)];
        const u = await t.userWith(grant);
        expect((await t.request("/api/approvals", { cookie: u.cookie })).status).toBe(403);
        expect((await decide(t, u.cookie, request.id, { decision: "approve" })).status).toBe(403);
      }
    }));

  it("approves, audits and emails the requester; a second decision conflicts", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const requester = await t.userWith([clubWide("anonymous")]);
      const hr = await t.userWith([clubWide("hr")]);
      const request = await createApproval(db, { type: "test", subjectUserId: requester.user.id });
      const ok = await decide(t, hr.cookie, request.id, { decision: "approve" });
      expect(ok.status).toBe(204);
      expect(t.mailer.sent.at(-1)?.to).toBe(requester.user.email);
      const audits = await db.select().from(auditLog);
      expect(audits.some((a) => a.action === "approval.decided")).toBe(true);
      expect(
        (await decide(t, hr.cookie, request.id, { decision: "reject", reason: "x" })).status,
      ).toBe(409);
    }));

  it("needs a reason to reject, and reviewers cannot decide their own request", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const own = await createApproval(db, { type: "test", subjectUserId: admin.user.id });
      expect((await decide(t, admin.cookie, own.id, { decision: "approve" })).status).toBe(403);
      const requester = await t.userWith([clubWide("anonymous")]);
      const other = await createApproval(db, { type: "test", subjectUserId: requester.user.id });
      expect((await decide(t, admin.cookie, other.id, { decision: "reject" })).status).toBe(400);
      expect(
        (await decide(t, admin.cookie, other.id, { decision: "needs_info", reason: "foto" }))
          .status,
      ).toBe(204);
    }));

  it("shows requesters their own requests and lets them withdraw", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const me = await t.userWith([clubWide("anonymous")]);
      const other = await t.userWith([clubWide("anonymous")]);
      const mine = await createApproval(db, { type: "test", subjectUserId: me.user.id });
      const res = await t.request("/api/approvals/mine", { cookie: me.cookie });
      expect(((await res.json()) as { entries: unknown[] }).entries).toHaveLength(1);
      expect(
        (
          await t.request(`/api/approvals/${mine.id}/withdraw`, {
            method: "POST",
            cookie: other.cookie,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request(`/api/approvals/${mine.id}/withdraw`, {
            method: "POST",
            cookie: me.cookie,
          })
        ).status,
      ).toBe(204);
    }));

  it("reminds reviewers once a day about requests waiting over a day", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      await t.userWith([clubWide("admin")]);
      const requester = await t.userWith([clubWide("anonymous")]);
      const request = await createApproval(db, { type: "test", subjectUserId: requester.user.id });
      expect(await remindReviewers(db, t.mailer, "http://x")).toBe(0);
      const later = new Date(Date.now() + 25 * 3600_000);
      t.mailer.sent.length = 0;
      expect(await remindReviewers(db, t.mailer, "http://x", later)).toBe(1);
      expect(t.mailer.sent.length).toBeGreaterThan(0);
      expect(await remindReviewers(db, t.mailer, "http://x", later)).toBe(0);
      expect(request.id).toBeTruthy();
      expect((await db.select().from(approvalRequests)).length).toBe(1);
    }));
});
