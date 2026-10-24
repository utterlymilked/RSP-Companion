import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { clubWide, cookieFrom, TEST_APP_URL, TEST_PASSWORD, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { roleAssignments, users } from "../auth/schema.js";
import { runRetention } from "../privacy/retention.js";
import { type Challenge, createChallenge, solveChallenge, verifySolution } from "./altcha.js";
import { CHALLENGE_HEADER, KEY_HEADER } from "./guard.js";
import { takeEmailBudget } from "./service.js";

const SECRET = "test-secret-that-is-at-least-32-characters";
const ip = (n: number) => ({ "x-forwarded-for": `203.0.113.${n}` });

/** A registration test app (limits on) with a helper that solves a fresh challenge per call. */
function setup(db: Parameters<typeof testApp>[0], reg: Parameters<typeof testApp>[1] = {}) {
  const t = testApp(db, { registration: { enabled: true, limits: true, ...reg?.registration } });
  const proof = async () => {
    const res = await t.request("/api/registration/challenge");
    return solveChallenge((await res.json()) as Challenge);
  };
  const signUp = async (
    email: string,
    extra: { headers?: Record<string, string>; challenge?: boolean } = {},
  ) =>
    t.request("/api/auth/sign-up/email", {
      json: { email, password: "a-long-password-1", name: "Teste" },
      headers: {
        ...(extra.challenge === false ? {} : { [CHALLENGE_HEADER]: await proof() }),
        ...extra.headers,
      },
    });
  return { t, proof, signUp };
}

describeDb("proof of work", () => {
  it("accepts a solved challenge once and rejects tampering and expiry", () => {
    const c = createChallenge(SECRET);
    const payload = solveChallenge(c);
    expect(verifySolution(SECRET, payload).ok).toBe(true);
    expect(verifySolution("another-secret-that-is-long-enough", payload).ok).toBe(false);
    expect(verifySolution(SECRET, "not base64 json").ok).toBe(false);
    expect(verifySolution(SECRET, payload, Date.now() + 11 * 60_000).ok).toBe(false);
  });
});

describeDb("self-registration guard", () => {
  it("is closed unless the stack switch and the module are on", () =>
    withRollback(async (db) => {
      const closed = testApp(db, { registration: { limits: true } });
      const res = await closed.request("/api/auth/sign-up/email", {
        json: { email: "a@example.test", password: "a-long-password-1", name: "A" },
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "registration_closed",
      );
      // Production starts with the beta module off even when the stack switch is on.
      const prod = testApp(db, { stack: "prod", registration: { enabled: true, limits: true } });
      const cfg = await prod.request("/api/registration/config");
      expect(((await cfg.json()) as { open: boolean }).open).toBe(false);
    }));

  it("requires a solved challenge, once", () =>
    withRollback(async (db) => {
      const { t, proof, signUp } = setup(db);
      expect((await signUp("a@example.test", { challenge: false })).status).toBe(400);
      const solved = await proof();
      const send = () =>
        t.request("/api/auth/sign-up/email", {
          json: { email: "b@example.test", password: "a-long-password-1", name: "B" },
          headers: { [CHALLENGE_HEADER]: solved, ...ip(1) },
        });
      expect((await send()).status).toBe(200);
      expect((await send()).status).toBe(400); // replayed
    }));

  it("answers the same for a new and an existing address", () =>
    withRollback(async (db) => {
      const { t, signUp } = setup(db);
      const existing = await t.userWith([]);
      const fresh = await signUp("fresh@example.test", { headers: ip(2) });
      const known = await signUp(existing.user.email, { headers: ip(3) });
      expect(known.status).toBe(fresh.status);
      expect(await known.json()).toEqual(await fresh.json());
      expect(known.headers.getSetCookie()).toEqual([]);
      expect(fresh.headers.getSetCookie()).toEqual([]);
      // A verification email goes to the new address only.
      expect(t.mailer.sent.map((m) => m.to)).toEqual(["fresh@example.test"]);
    }));

  it("limits sign-ups per IP and verification mail per address", () =>
    withRollback(async (db) => {
      const { signUp } = setup(db);
      for (let n = 0; n < 5; n++) {
        expect((await signUp(`u${n}@d${n}.test`, { headers: ip(4) })).status).toBe(200);
      }
      expect((await signUp("u9@d9.test", { headers: ip(4) })).status).toBe(429);
      // Another IP, same address: the per-address minute limit now applies.
      expect((await signUp("u0@d0.test", { headers: ip(5) })).status).toBe(429);
    }));

  it("pauses registration emails at the daily cap", () =>
    withRollback(async (db) => {
      const { t, signUp } = setup(db, { registration: { emailDailyLimit: 1 } });
      expect(await takeEmailBudget(db, 1)).toBe(true);
      expect(await takeEmailBudget(db, 1)).toBe(false);
      const res = await signUp("late@example.test", { headers: ip(6) });
      expect(res.status).toBe(503);
      const cfg = (await (await t.request("/api/registration/config")).json()) as {
        paused: boolean;
      };
      expect(cfg.paused).toBe(true);
    }));

  it("asks the staging key and compares it in constant time", () =>
    withRollback(async (db) => {
      const { signUp } = setup(db, { registration: { key: "rotating-staging-key-123" } });
      expect((await signUp("k@example.test", { headers: ip(7) })).status).toBe(403);
      const ok = await signUp("k@example.test", {
        headers: { ...ip(7), [KEY_HEADER]: "rotating-staging-key-123" },
      });
      expect(ok.status).toBe(200);
    }));

  it("limits sign-in attempts per address", () =>
    withRollback(async (db) => {
      const { t } = setup(db);
      const attempt = () =>
        t.request("/api/auth/sign-in/email", {
          json: { email: "nobody@example.test", password: "wrong-password-123" },
        });
      for (let n = 0; n < 5; n++) expect((await attempt()).status).not.toBe(429);
      expect((await attempt()).status).toBe(429);
    }));

  it("shows the status to developers only", () =>
    withRollback(async (db) => {
      const { t } = setup(db);
      const dev = await t.userWith([clubWide("developer")]);
      const res = await t.request("/api/registration/status", { cookie: dev.cookie });
      expect(res.status).toBe(200);
      const other = await t.userWith([clubWide("staff")]);
      expect((await t.request("/api/registration/status", { cookie: other.cookie })).status).toBe(
        403,
      );
    }));
});

describeDb("verification and the anonymous role", () => {
  it("activates on the emailed link, signs in and grants only `anonymous`", () =>
    withRollback(async (db) => {
      const { t, signUp } = setup(db);
      const email = "novo@example.test";
      expect((await signUp(email, { headers: ip(10) })).status).toBe(200);
      // Unverified: no sign-in yet.
      const early = await t.request("/api/auth/sign-in/email", {
        json: { email, password: "a-long-password-1" },
      });
      expect(early.status).toBe(403);
      const link = t.mailer.sent[0]?.text.match(/https?:\/\/\S+/)?.[0];
      expect(link).toBeTruthy();
      const url = new URL(link as string);
      const verify = await t.app.request(`${url.pathname}${url.search}`, {
        headers: { origin: TEST_APP_URL },
      });
      expect([200, 302]).toContain(verify.status);
      const cookie = cookieFrom(verify);
      const me = await t.request("/api/me", { cookie });
      expect(me.status).toBe(200);
      const body = (await me.json()) as { roles: { role: string }[]; permissions: string[] };
      expect(body.roles.map((r) => r.role)).toEqual(["anonymous"]);
      expect(body.permissions).toEqual([]);
      // And now password sign-in works.
      const ok = await t.request("/api/auth/sign-in/email", {
        json: { email, password: "a-long-password-1" },
      });
      expect(ok.status).toBe(200);
    }));

  it("refuses disposable domains silently", () =>
    withRollback(async (db) => {
      const { t, signUp } = setup(db);
      const res = await signUp("x@mailinator.com", { headers: ip(11) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(t.mailer.sent).toEqual([]);
      const found = await db.select().from(users).where(eq(users.email, "x@mailinator.com"));
      expect(found).toEqual([]);
    }));

  it("keeps anonymous and external out of every protected area", () =>
    withRollback(async (db) => {
      const { t } = setup(db);
      for (const role of ["anonymous", "external"] as const) {
        const u = await t.userWith([clubWide(role)]);
        for (const path of ["/api/users", "/api/people", "/api/teams", "/api/audit-log"]) {
          expect((await t.request(path, { cookie: u.cookie })).status).toBe(403);
        }
        const me = await t.request("/api/me", { cookie: u.cookie });
        expect(me.status).toBe(200);
      }
    }));

  it("deletes accounts left unverified for 7 days, never verified ones", () =>
    withRollback(async (db) => {
      const old = new Date(Date.now() - 8 * 86_400_000);
      const [stale] = await db
        .insert(users)
        .values({
          name: "Velho",
          email: "stale@example.test",
          emailVerified: false,
          createdAt: old,
        })
        .returning();
      const [fresh] = await db
        .insert(users)
        .values({ name: "Novo", email: "fresh@example.test", emailVerified: false })
        .returning();
      const [verified] = await db
        .insert(users)
        .values({ name: "Ok", email: "ok@example.test", emailVerified: true, createdAt: old })
        .returning();
      await runRetention(db);
      const left = (await db.select({ id: users.id }).from(users)).map((u) => u.id);
      expect(left).toContain(fresh?.id);
      expect(left).toContain(verified?.id);
      expect(left).not.toContain(stale?.id);
      expect(TEST_PASSWORD).toBeTruthy();
      expect(
        await db
          .select()
          .from(roleAssignments)
          .where(eq(roleAssignments.userId, stale?.id ?? "")),
      ).toEqual([]);
    }));
});
