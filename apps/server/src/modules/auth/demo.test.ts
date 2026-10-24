import type { MeResponse } from "@rsc/shared";
import { expect, it } from "vitest";
import { createApp } from "../../app.js";
import { memoryMailer } from "../../mail/mailer.js";
import { memoryPush } from "../../push/index.js";
import { cookieFrom, TEST_APP_URL, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { createAuth } from "./auth.js";
import { createUserWithPassword } from "./service.js";

const CODE = "0123456789abcdef01234567";
const ACCOUNTS = [{ email: "demo@rsc.test", name: "Demo", role: "admin" }] as const;

const post = (app: ReturnType<typeof createApp>, path: string, json: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { origin: TEST_APP_URL, "content-type": "application/json" },
    body: JSON.stringify(json),
  });

describeDb("demo sign-in (staging sandbox)", () => {
  it("signs a listed demo account in without a password and refuses everyone else", () =>
    withRollback(async (db) => {
      const mailer = memoryMailer();
      const auth = createAuth(db, {
        appUrl: TEST_APP_URL,
        secret: "test-secret-that-is-at-least-32-characters",
        mailer,
        disableRateLimit: true,
        demoAccounts: ACCOUNTS,
        demoAccessCode: CODE,
      });
      const app = createApp({
        db,
        auth,
        mailer,
        push: memoryPush(),
        stack: "dev",
        appUrl: TEST_APP_URL,
        storage: null,
      });
      await createUserWithPassword(db, {
        email: "demo@rsc.test",
        name: "Demo",
        password: "x".repeat(24),
      });
      await createUserWithPassword(db, {
        email: "real@club.pt",
        name: "Real",
        password: "x".repeat(24),
      });

      const status = await app.request("/api/auth/demo/status");
      expect(await status.json()).toEqual({ enabled: true });

      // Without the right code nothing is listed and nobody is signed in.
      for (const code of ["", "wrong", CODE.toUpperCase()]) {
        expect((await post(app, "/api/auth/demo/accounts", { code })).status).toBe(403);
        const refused = await post(app, "/api/auth/demo/sign-in", { email: "demo@rsc.test", code });
        expect(refused.status).toBe(403);
        expect(refused.headers.get("set-cookie")).toBeNull();
      }
      expect((await app.request("/api/auth/demo/accounts")).status).not.toBe(200);

      const list = await post(app, "/api/auth/demo/accounts", { code: CODE });
      expect(((await list.json()) as { accounts: unknown[] }).accounts).toHaveLength(1);

      const ok = await post(app, "/api/auth/demo/sign-in", { email: "demo@rsc.test", code: CODE });
      expect(ok.status).toBe(200);
      const me = await app.request("/api/me", { headers: { cookie: cookieFrom(ok) } });
      expect(((await me.json()) as MeResponse).user.email).toBe("demo@rsc.test");

      const real = await post(app, "/api/auth/demo/sign-in", { email: "real@club.pt", code: CODE });
      expect(real.status).toBe(403);
    }));

  it("is not mounted unless demo mode is on", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      expect((await t.app.request("/api/auth/demo/accounts")).status).toBe(404);
      expect(
        (await t.request("/api/auth/demo/sign-in", { json: { email: "a@b.pt" } })).status,
      ).toBe(404);
    }));
});
