import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createDb } from "../db/index.js";
import { memoryMailer } from "../mail/mailer.js";
import { createAuth } from "../modules/auth/auth.js";
import { memoryPush } from "../push/index.js";
import { type AppPolicy, clientOf, requirementsOf } from "./app-version.js";

// No database needed: the pool connects lazily and the routes under test never query it.
const { db, close } = createDb("postgres://nobody@127.0.0.1:1/none");
afterAll(close);
const appUrl = "http://localhost:8081";
const mailer = memoryMailer();
const testApp = async ({ policy }: { policy: AppPolicy }) => ({
  app: createApp({
    db,
    auth: createAuth(db, { appUrl, secret: "x".repeat(32), mailer }),
    mailer,
    push: memoryPush(),
    stack: "dev",
    appUrl,
    evidence: null,
    storage: null,
    registration: { enabled: false, emailDailyLimit: 250, secret: "x".repeat(32), limits: false },
    appPolicy: policy,
  }),
});
// Any route behind the gate that answers without a database.
const ROUTE = "/api/auth/ok";

const ota = { runtimeVersion: "3", createdAt: "2026-10-25T10:00:00.000Z" };
const native = (over: Record<string, string> = {}) => ({
  "x-app-platform": "android",
  "x-app-runtime": "3",
  "x-app-built-at": "2026-10-25T10:00:00.000Z",
  ...over,
});

describe("forced updates", () => {
  it("defaults the minimum runtime to the one served over the air", () => {
    expect(requirementsOf({ enforce: true, ota }).minRuntime).toBe("3");
    expect(requirementsOf({ enforce: true, minRuntime: "4", ota }).minRuntime).toBe("4");
  });

  it("resolves `current` to the bundle served now", () => {
    expect(requirementsOf({ enforce: true, minBuiltAt: "current", ota }).minBuiltAt).toBe(
      ota.createdAt,
    );
    expect(
      requirementsOf({ enforce: true, minBuiltAt: "current", ota: null }).minBuiltAt,
    ).toBeNull();
  });

  it("treats a browser without the header as web, and a bare native client as outdated", () => {
    expect(clientOf(new Headers({ "sec-fetch-site": "same-origin" })).platform).toBe("web");
    expect(clientOf(new Headers()).platform).toBeNull();
  });

  it("refuses nothing while enforcement is off", async () => {
    const { app } = await testApp({ policy: { enforce: false, ota } });
    expect((await app.request(ROUTE)).status).not.toBe(426);
  });

  describe("enforced", () => {
    const policy = {
      enforce: true,
      minBuiltAt: "current",
      downloadUrl: "https://dl.test/apk",
      ota,
    };

    it("lets a current app, the web app and the health check through", async () => {
      const { app } = await testApp({ policy });
      expect((await app.request(ROUTE, { headers: native() })).status).not.toBe(426);
      expect((await app.request(ROUTE, { headers: { "x-app-platform": "web" } })).status).not.toBe(
        426,
      );
      expect((await app.request("/api/health")).status).toBe(200);
    });

    it("answers 426 with what to do for an old runtime, an old bundle and an app with no header", async () => {
      const { app } = await testApp({ policy });
      const ask = async (headers: Record<string, string>) => {
        const res = await app.request(ROUTE, { headers });
        return [
          res.status,
          ((await res.json()) as { error: { code: string; issues: { update: string } } }).error,
        ];
      };
      expect(await ask(native({ "x-app-runtime": "2" }))).toEqual([
        426,
        { code: "app_update_required", issues: { update: "apk" } },
      ]);
      expect(await ask(native({ "x-app-built-at": "2026-10-19T10:00:00.000Z" }))).toEqual([
        426,
        { code: "app_update_required", issues: { update: "bundle" } },
      ]);
      expect((await ask({}))[0]).toBe(426);
    });

    it("publishes the requirements to anyone, even an outdated app", async () => {
      const { app } = await testApp({ policy });
      const res = await app.request("/api/app/requirements", {
        headers: native({ "x-app-runtime": "1" }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        enforced: true,
        minRuntime: "3",
        minBuiltAt: ota.createdAt,
        downloadUrl: "https://dl.test/apk",
        served: { runtime: "3", builtAt: ota.createdAt },
      });
    });
  });
});
