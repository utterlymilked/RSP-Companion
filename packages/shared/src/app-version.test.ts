import { describe, expect, it } from "vitest";
import { type AppRequirements, judgeClient } from "./app-version.ts";

const req = (over: Partial<AppRequirements> = {}): AppRequirements => ({
  enforced: true,
  minRuntime: "3",
  minBuiltAt: "2026-10-25T10:00:00.000Z",
  downloadUrl: null,
  served: null,
  ...over,
});
const client = (over = {}) => ({
  platform: "android",
  runtime: "3",
  builtAt: "2026-10-25T10:00:00.000Z",
  ...over,
});

describe("judgeClient", () => {
  it("accepts a current install", () => {
    expect(judgeClient(req(), client())).toBe("ok");
    expect(judgeClient(req(), client({ runtime: "10", builtAt: "2026-11-01T00:00:00.000Z" }))).toBe(
      "ok",
    );
  });

  it("needs an APK below the minimum runtime, even if the bundle is new", () => {
    expect(judgeClient(req(), client({ runtime: "2" }))).toBe("apk");
    expect(judgeClient(req(), client({ runtime: "9" }))).toBe("ok"); // not a string comparison
  });

  it("needs the update when the bundle is older than the minimum or its age is unknown", () => {
    expect(judgeClient(req(), client({ builtAt: "2026-10-19T10:00:00.000Z" }))).toBe("bundle");
    expect(judgeClient(req(), client({ builtAt: null }))).toBe("bundle");
  });

  it("treats an app that does not say what it is as outdated, and never blocks the web", () => {
    expect(judgeClient(req(), client({ platform: null }))).toBe("apk");
    expect(judgeClient(req(), client({ runtime: null }))).toBe("apk");
    expect(judgeClient(req(), { platform: "web", runtime: null, builtAt: null })).toBe("ok");
  });

  it("blocks nothing while enforcement is off", () => {
    expect(judgeClient(req({ enforced: false }), client({ platform: null }))).toBe("ok");
  });
});
