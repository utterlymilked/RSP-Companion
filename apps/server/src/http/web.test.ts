import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { withWebApp } from "./web.js";

function distDir() {
  const dir = mkdtempSync(join(tmpdir(), "rsp-web-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>RSP</title>");
  mkdirSync(join(dir, "_expo"));
  writeFileSync(join(dir, "_expo", "entry.js"), "console.log('app')");
  return dir;
}

const api = new Hono()
  .basePath("/api")
  .get("/health", (c) => c.json({ status: "ok" }))
  .notFound((c) => c.json({ error: { code: "not_found" } }, 404));

describe("withWebApp", () => {
  const app = withWebApp(api, { distDir: distDir() });

  it("keeps the API under /api", async () => {
    expect(await (await app.request("/api/health")).json()).toEqual({ status: "ok" });
  });

  it("serves files of the web build", async () => {
    const res = await app.request("/_expo/entry.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("console.log");
  });

  it("answers client-side routes with index.html", async () => {
    const res = await app.request("/invite?token=abc");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>RSP</title>");
  });

  it("does not serve index.html for unknown API paths", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found" } });
  });

  it("does not answer unknown /.well-known files with index.html", async () => {
    expect((await app.request("/.well-known/assetlinks.json")).status).toBe(404);
  });
});

describe("app links", () => {
  const fingerprint = Array.from({ length: 32 }, () => "AB").join(":");
  const app = withWebApp(api, {
    distDir: distDir(),
    appLinks: { appleTeamId: "ABCDE12345", androidCertSha256: [fingerprint] },
  });

  it("lets iOS open invitation and reset links in the app", async () => {
    const res = await app.request("/.well-known/apple-app-site-association");
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.applinks.details[0].appIDs).toEqual(["ABCDE12345.pt.realsportmassama.companion"]);
    expect(body.applinks.details[0].components).toEqual([
      { "/": "/invite*" },
      { "/": "/reset-password*" },
    ]);
  });

  it("lets Android verify the app's signing certificate", async () => {
    const [statement] = await (await app.request("/.well-known/assetlinks.json")).json();
    expect(statement.target).toEqual({
      namespace: "android_app",
      package_name: "pt.realsportmassama.companion",
      sha256_cert_fingerprints: [fingerprint],
    });
  });
});
