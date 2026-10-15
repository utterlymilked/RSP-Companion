import { healthResponseSchema } from "@rsc/shared";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDb } from "./db/index.js";
import { memoryMailer } from "./mail/mailer.js";
import { createAuth } from "./modules/auth/auth.js";

// No database needed: the pool connects lazily and these routes never query it.
const { db, close } = createDb("postgres://nobody@127.0.0.1:1/none");
const mailer = memoryMailer();
const appUrl = "http://localhost:8081";
const auth = createAuth(db, { appUrl, secret: "x".repeat(32), mailer });
const app = createApp({ db, auth, mailer, appUrl });
afterAll(close);

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(await res.json()).status).toBe("ok");
  });
});
