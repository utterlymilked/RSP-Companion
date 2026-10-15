import { describe, expect, it } from "vitest";
import { loadDbEnv, loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgres://rsp:rsp@localhost:5432/rsp",
  BETTER_AUTH_SECRET: "a".repeat(32),
};

describe("loadEnv", () => {
  it("applies defaults and coerces numbers", () => {
    const env = loadEnv({ ...base, PORT: "8080" });
    expect(env).toMatchObject({
      NODE_ENV: "development",
      PORT: 8080,
      APP_VERSION: "dev",
      APP_URL: "http://localhost:5173",
    });
  });

  it("rejects a missing or non-postgres DATABASE_URL", () => {
    expect(() => loadEnv({ BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...base, DATABASE_URL: "mysql://localhost/rsp" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("requires a long auth secret", () => {
    expect(() => loadEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("requires SMTP and an https APP_URL in production", () => {
    const production = { ...base, NODE_ENV: "production" };
    expect(() => loadEnv({ ...production, APP_URL: "https://app.example.pt" })).toThrow(/SMTP_URL/);
    expect(() => loadEnv({ ...production, SMTP_URL: "smtp://mail.example.pt:587" })).toThrow(
      /APP_URL/,
    );
    expect(
      loadEnv({
        ...production,
        SMTP_URL: "smtp://mail.example.pt:587",
        APP_URL: "https://app.example.pt",
      }).NODE_ENV,
    ).toBe("production");
  });
});

describe("loadDbEnv", () => {
  it("needs only DATABASE_URL", () => {
    expect(loadDbEnv({ DATABASE_URL: base.DATABASE_URL }).NODE_ENV).toBe("development");
  });
});
