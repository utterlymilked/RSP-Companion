import { describe, expect, it } from "vitest";
import { apiBaseUrl } from "./config";

describe("apiBaseUrl", () => {
  it("uses the configured URL without a trailing slash", () => {
    expect(apiBaseUrl("https://rsp.example/", "ios")).toBe("https://rsp.example");
  });

  it("falls back to the same origin on web", () => {
    expect(apiBaseUrl(undefined, "web")).toBe("/");
  });

  it("requires a URL on native", () => {
    expect(() => apiBaseUrl(undefined, "android")).toThrow(/EXPO_PUBLIC_API_URL/);
  });
});
