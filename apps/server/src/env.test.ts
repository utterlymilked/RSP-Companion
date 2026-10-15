import { describe, expect, it } from "vitest";
import { loadDbEnv, loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgres://rsc:rsc@localhost:5432/rsc",
  BETTER_AUTH_SECRET: "a".repeat(32),
};

describe("loadEnv", () => {
  it("applies defaults and coerces numbers", () => {
    const env = loadEnv({ ...base, PORT: "8080" });
    expect(env).toMatchObject({
      NODE_ENV: "development",
      PORT: 8080,
      APP_VERSION: "dev",
      APP_URL: "http://localhost:8081",
    });
  });

  it("treats empty values as unset", () => {
    const env = loadEnv({ ...base, APP_VERSION: "", SMTP_URL: "", APPLE_TEAM_ID: "" });
    expect(env.APP_VERSION).toBe("dev");
    expect(env.SMTP_URL).toBeUndefined();
    expect(env.APPLE_TEAM_ID).toBeUndefined();
  });

  it("rejects a missing or non-postgres DATABASE_URL", () => {
    expect(() => loadEnv({ BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...base, DATABASE_URL: "mysql://localhost/rsc" })).toThrow(
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

describe("app link settings", () => {
  const fingerprint = Array.from({ length: 32 }, () => "0F").join(":");

  it("splits the Android certificate fingerprints", () => {
    const env = loadEnv({ ...base, ANDROID_CERT_SHA256: ` ${fingerprint} , ${fingerprint}` });
    expect(env.ANDROID_CERT_SHA256).toEqual([fingerprint, fingerprint]);
  });

  it("rejects malformed values", () => {
    expect(() => loadEnv({ ...base, ANDROID_CERT_SHA256: "AB:CD" })).toThrow(/ANDROID_CERT_SHA256/);
    expect(() => loadEnv({ ...base, APPLE_TEAM_ID: "team" })).toThrow(/APPLE_TEAM_ID/);
  });
});

describe("loadDbEnv", () => {
  it("needs only DATABASE_URL", () => {
    expect(loadDbEnv({ DATABASE_URL: base.DATABASE_URL }).NODE_ENV).toBe("development");
  });
});
