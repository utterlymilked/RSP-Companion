import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { memoryMailer } from "../../mail/mailer.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { setOwnerPerson } from "../auth/owner.js";
import { roleAssignments, sessions, users } from "../auth/schema.js";
import { persons } from "../people/schema.js";
import { runInactiveUsers } from "./inactive.js";
import { accountNotices } from "./schema.js";

const DAY = 86_400_000;
const NOW = new Date("2027-12-01T10:00:00Z");
const monthsAgo = (m: number, extraDays = 0) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - m);
  return new Date(d.getTime() - extraDays * DAY);
};

describeDb("inactive-user job", () => {
  const run = async (
    db: Parameters<typeof runInactiveUsers>[0],
    opts: { dryRun?: boolean; now?: Date; cap?: number } = {},
  ) => {
    const mailer = memoryMailer();
    const result = await runInactiveUsers(db, {
      now: opts.now ?? NOW,
      dryRun: opts.dryRun ?? false,
      cap: opts.cap,
      mailer,
      appUrl: "https://app.test",
      evidence: null,
    });
    return { result, mailer };
  };
  const user = async (
    db: Parameters<typeof runInactiveUsers>[0],
    email: string,
    lastSignInAt: Date | null,
    roles: string[] = ["anonymous"],
    personId?: string,
  ) => {
    const [u] = await db
      .insert(users)
      .values({
        name: email,
        email,
        emailVerified: true,
        lastSignInAt,
        createdAt: lastSignInAt ?? NOW,
      })
      .returning();
    if (!u) throw new Error("no user");
    if (personId) await setOwnerPerson(db, u.id, personId);
    if (roles.length > 0) {
      await db
        .insert(roleAssignments)
        .values(
          roles.map((role) => ({ userId: u.id, role }) as typeof roleAssignments.$inferInsert),
        );
    }
    return u;
  };
  const exists = async (db: Parameters<typeof runInactiveUsers>[0], id: string) =>
    (await db.select({ id: users.id }).from(users).where(eq(users.id, id))).length === 1;

  it("warns 30 days before, then deletes a week later only after a notice", () =>
    withRollback(async (db) => {
      // Last sign-in 11 months and 5 days ago: the 12-month deadline is 25 days away.
      const u = await user(db, "a@example.test", monthsAgo(11, 5));
      const first = await run(db);
      expect(first.result).toMatchObject({ warned: 1, deleted: 0 });
      expect(first.mailer.sent).toHaveLength(1);
      expect(first.mailer.sent[0]?.to).toBe("a@example.test");
      // Same day again: no second mail.
      expect((await run(db)).result.warned).toBe(0);

      // Past the deadline, a day after the notice: deleted.
      const later = new Date(NOW.getTime() + 30 * DAY);
      const done = await run(db, { now: later });
      expect(done.result.deleted).toBe(1);
      expect(await exists(db, u.id)).toBe(false);
    }));

  it("never acts without a notice that has been out for a day", () =>
    withRollback(async (db) => {
      const u = await user(db, "b@example.test", monthsAgo(13));
      const first = await run(db);
      expect(first.result).toMatchObject({ warned: 1, deleted: 0 });
      expect(await exists(db, u.id)).toBe(true);
      const next = await run(db, { now: new Date(NOW.getTime() + 2 * DAY) });
      expect(next.result.deleted).toBe(1);
    }));

  it("deactivates, never deletes, a login that belongs to a person", () =>
    withRollback(async (db) => {
      const [p] = await db.insert(persons).values({ fullName: "Pessoa Teste" }).returning();
      const u = await user(db, "c@example.test", monthsAgo(24, 3), ["anonymous"], p?.id);
      await db
        .insert(sessions)
        .values({ userId: u.id, token: "t", expiresAt: new Date(NOW.getTime() + DAY) });
      await run(db);
      const next = await run(db, { now: new Date(NOW.getTime() + 2 * DAY) });
      expect(next.result).toMatchObject({ deactivated: 1, deleted: 0 });
      const [after] = await db.select().from(users).where(eq(users.id, u.id));
      expect(after?.deactivatedAt).not.toBeNull();
      expect(await db.select().from(sessions).where(eq(sessions.userId, u.id))).toEqual([]);
    }));

  it("leaves staff, recent logins and unverified-or-deactivated rows alone", () =>
    withRollback(async (db) => {
      const staff = await user(db, "staff@example.test", monthsAgo(40), ["admin"]);
      const recent = await user(db, "recent@example.test", monthsAgo(2));
      const external = await user(db, "ext@example.test", monthsAgo(13), ["external"]);
      const { result } = await run(db);
      expect(result.warned).toBe(1); // only the external login
      expect(await exists(db, staff.id)).toBe(true);
      expect(await exists(db, recent.id)).toBe(true);
      expect(await exists(db, external.id)).toBe(true);
    }));

  it("a dry run sends and changes nothing", () =>
    withRollback(async (db) => {
      const u = await user(db, "d@example.test", monthsAgo(13));
      await db
        .insert(accountNotices)
        .values({ userId: u.id, daysBefore: 7, sentAt: monthsAgo(0, 3) });
      const { result, mailer } = await run(db, { dryRun: true });
      expect(result).toMatchObject({ dryRun: true, deleted: 1 });
      expect(mailer.sent).toHaveLength(0);
      expect(await exists(db, u.id)).toBe(true);
    }));

  it("honours the cap per run", () =>
    withRollback(async (db) => {
      for (const n of [1, 2, 3]) {
        const u = await user(db, `cap${n}@example.test`, monthsAgo(13));
        await db
          .insert(accountNotices)
          .values({ userId: u.id, daysBefore: 7, sentAt: monthsAgo(0, 3) });
      }
      const { result } = await run(db, { cap: 2 });
      expect(result).toMatchObject({ deleted: 2, capped: true });
    }));

  it("signing in again clears the notices", () =>
    withRollback(async (db) => {
      const u = await user(db, "e@example.test", monthsAgo(11, 5));
      await run(db);
      await db
        .update(users)
        .set({ lastSignInAt: new Date(NOW.getTime() + DAY) })
        .where(eq(users.id, u.id));
      await run(db, { now: new Date(NOW.getTime() + 2 * DAY) });
      expect(await db.select().from(accountNotices).where(eq(accountNotices.userId, u.id))).toEqual(
        [],
      );
    }));

  it("keeps the identity-retention setting admin-only, with sane bounds", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const coach = await t.userWith([clubWide("staff")]);
      const url = "/api/settings/identity-retention";
      expect(await (await t.request(url, { cookie: admin.cookie })).json()).toEqual({
        pendingDays: 30,
        graceDays: 0,
      });
      expect((await t.request(url, { cookie: coach.cookie })).status).toBe(403);
      const put = (body: unknown, cookie = admin.cookie) =>
        t.request(url, { method: "PUT", cookie, json: body });
      expect((await put({ pendingDays: 14, graceDays: 7 })).status).toBe(200);
      expect(await (await t.request(url, { cookie: admin.cookie })).json()).toEqual({
        pendingDays: 14,
        graceDays: 7,
      });
      expect((await put({ pendingDays: 14, graceDays: 99 })).status).toBe(400);
      expect((await put({ pendingDays: 14, graceDays: 0 }, coach.cookie)).status).toBe(403);
    }));
});
