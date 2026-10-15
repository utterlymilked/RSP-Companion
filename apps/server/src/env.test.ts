import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("applies defaults and coerces numbers", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://rsp:rsp@localhost:5432/rsp", PORT: "8080" });
    expect(env).toMatchObject({ NODE_ENV: "development", PORT: 8080, APP_VERSION: "dev" });
  });

  it("rejects a missing or non-postgres DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: "mysql://localhost/rsp" })).toThrow(/DATABASE_URL/);
  });
});
